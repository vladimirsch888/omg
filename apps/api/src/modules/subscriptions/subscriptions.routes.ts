import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import { billSubscription } from "./subscriptions.service";
import type { AppEnv } from "../../types/hono";

export const subscriptionsRouter = new Hono<AppEnv>();
subscriptionsRouter.use(requireAuth);

subscriptionsRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const clientId = c.req.query("clientId");
  const subscriptions = await prisma.subscription.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(clientId ? { clientId } : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      licenseProduct: { select: { id: true, name: true } },
    },
    orderBy: { nextBillingDate: "asc" },
  });
  return c.json(subscriptions);
});

subscriptionsRouter.get("/:id", async (c) => {
  const auth = c.get("auth");
  const subscription = await prisma.subscription.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
    include: {
      client: true,
      project: { select: { id: true, name: true } },
      licenseProduct: true,
      operations: { orderBy: { accrualDate: "desc" } },
    },
  });
  if (!subscription) throw new AppError(404, "Подписка не найдена");
  return c.json(subscription);
});

const createSchema = z.object({
  clientId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  licenseProductId: z.string().uuid(),
  price: z.number().positive().optional(),
  durationMonths: z.number().int().positive().optional(),
  vendorSharePercent: z.number().min(0).max(100).optional(),
  taxable: z.boolean().optional(),
  startDate: z.string().datetime(),
});

// Creates a subscription and immediately bills its first period — the
// client's mental model is "I sold a license", not "I created a plan".
subscriptionsRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = createSchema.parse(await c.req.json());
  const organizationId = auth.organizationId;

  const [client, product] = await Promise.all([
    prisma.client.findFirst({ where: { id: body.clientId, organizationId } }),
    prisma.licenseProduct.findFirst({ where: { id: body.licenseProductId, organizationId } }),
  ]);
  if (!client) throw new AppError(404, "Клиент не найден");
  if (!product) throw new AppError(404, "Продукт не найден");
  if (product.type === "WORK") {
    throw new AppError(400, "У этого продукта нет срока подписки — это разовая работа. Оформите её через раздел Продажи.");
  }

  if (body.projectId) {
    const project = await prisma.project.findFirst({ where: { id: body.projectId, organizationId } });
    if (!project) throw new AppError(404, "Проект не найден");
    if (project.clientId !== body.clientId) {
      throw new AppError(400, "Проект принадлежит другому клиенту");
    }
  }

  const durationMonths = body.durationMonths ?? product.defaultDurationMonths;
  if (!durationMonths) {
    throw new AppError(400, "У продукта не задан срок подписки по умолчанию — укажите его вручную.");
  }

  const startDate = new Date(body.startDate);
  const subscription = await prisma.subscription.create({
    data: {
      organizationId,
      clientId: body.clientId,
      projectId: body.projectId ?? null,
      licenseProductId: body.licenseProductId,
      price: body.price ?? product.defaultPrice,
      durationMonths,
      vendorSharePercent: body.vendorSharePercent ?? product.defaultVendorSharePercent,
      taxable: body.taxable ?? product.defaultTaxable,
      startDate,
      nextBillingDate: startDate,
    },
    include: { client: true, licenseProduct: true },
  });

  const { subscription: billed } = await billSubscription(subscription, startDate, auth.userId);
  return c.json(billed, 201);
});

const billSchema = z.object({
  // Confirmed (or changed) on the "Продлить" prompt; when it differs from
  // the subscription's current price, that becomes the new price going
  // forward too — see billSubscription's priceOverride.
  amount: z.number().positive().optional(),
});

// The one-button "Продлить" (renew / duplicate to next period) action.
subscriptionsRouter.post("/:id/bill", async (c) => {
  const auth = c.get("auth");
  const body = billSchema.parse(await c.req.json().catch(() => ({})));
  const subscription = await prisma.subscription.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
    include: { client: true, licenseProduct: true },
  });
  if (!subscription) throw new AppError(404, "Подписка не найдена");
  if (subscription.status !== "ACTIVE") {
    throw new AppError(400, "Нельзя выставить платёж по приостановленной или отменённой подписке");
  }

  const result = await billSubscription(subscription, subscription.nextBillingDate, auth.userId, body.amount);
  return c.json(result, 201);
});

const updateSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
  price: z.number().positive().optional(),
  durationMonths: z.number().int().positive().optional(),
  vendorSharePercent: z.number().min(0).max(100).optional(),
  taxable: z.boolean().optional(),
  nextBillingDate: z.string().datetime().optional(),
});

subscriptionsRouter.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const body = updateSchema.parse(await c.req.json());
  const subscription = await prisma.subscription.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!subscription) throw new AppError(404, "Подписка не найдена");

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      ...body,
      nextBillingDate: body.nextBillingDate ? new Date(body.nextBillingDate) : undefined,
    },
  });
  return c.json(updated);
});

// Operation.subscriptionId is SetNull on delete, so past billing history
// (the Operations already created) is kept — only the subscription "plan"
// itself and its future billing cycle go away, matching how deleting a
// Sale also leaves its booked operations in place.
subscriptionsRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const subscription = await prisma.subscription.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!subscription) throw new AppError(404, "Подписка не найдена");
  await prisma.subscription.delete({ where: { id: subscription.id } });
  return c.body(null, 204);
});
