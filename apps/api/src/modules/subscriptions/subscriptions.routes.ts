import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { AppError } from "../../utils/errors";
import { assertClient, assertLicenseProduct, assertProject } from "../../utils/ownership";
import { audit } from "../audit/audit.service";
import { billSubscription, getMonthSummary } from "./subscriptions.service";
import type { AppEnv } from "../../types/hono";

export const subscriptionsRouter = new Hono<AppEnv>();

const listQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
  q: z.string().trim().max(200).optional(),
});

subscriptionsRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const q = listQuerySchema.parse(c.req.query());
  const subscriptions = await prisma.subscription.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { client: { name: { contains: q.q, mode: "insensitive" } } },
              { licenseProduct: { name: { contains: q.q, mode: "insensitive" } } },
            ],
          }
        : {}),
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

// Must come before "/:id" so "month-summary" isn't matched as an id.
subscriptionsRouter.get("/month-summary", async (c) => {
  const auth = c.get("auth");
  const summary = await getMonthSummary(auth.organizationId);
  return c.json(summary);
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
    assertClient(organizationId, body.clientId),
    assertLicenseProduct(organizationId, body.licenseProductId),
  ]);
  void client;
  if (product.type === "WORK") {
    throw new AppError(400, "У этого продукта нет срока подписки — это разовая работа. Оформите её через раздел Продажи.");
  }

  if (body.projectId) {
    const project = await assertProject(organizationId, body.projectId);
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
  audit({ organizationId, userId: auth.userId, action: "create", entity: "subscription", entityId: subscription.id, summary: `Подписка: ${subscription.client.name} — ${subscription.licenseProduct.name}, ${Number(subscription.price)} ₽ / ${durationMonths} мес.` });
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

  // Record the operation on the date the money actually arrives (now), not
  // the subscription's scheduled due date — an overdue renewal must show up
  // as "renewed this month" even though it was due earlier. The schedule
  // itself still advances from the old due date (see billSubscription), so
  // a late payment doesn't drag future due dates along with it.
  const result = await billSubscription(subscription, new Date(), auth.userId, body.amount);
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "bill", entity: "subscription", entityId: subscription.id, summary: `Продлена подписка ${subscription.client.name} — ${subscription.licenseProduct.name} на ${Number(result.incomeOperation.amount)} ₽` });
  return c.json(result, 201);
});

/**
 * "Счёт отправлен" — the preparation stage before renewing: the invoice for
 * the upcoming period has gone to the client, but the money hasn't arrived,
 * so nothing is booked yet. POST marks it (stamping the date), DELETE undoes
 * a misclick. Renewing clears it on its own (see billSubscription).
 */
subscriptionsRouter.post("/:id/invoice-sent", async (c) => {
  const auth = c.get("auth");
  const subscription = await prisma.subscription.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!subscription) throw new AppError(404, "Подписка не найдена");

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { invoiceSentAt: new Date() },
  });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "subscription", entityId: subscription.id, summary: "Отмечено: счёт отправлен" });
  return c.json(updated);
});

subscriptionsRouter.delete("/:id/invoice-sent", async (c) => {
  const auth = c.get("auth");
  const subscription = await prisma.subscription.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!subscription) throw new AppError(404, "Подписка не найдена");

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { invoiceSentAt: null },
  });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "subscription", entityId: subscription.id, summary: "Снята отметка «счёт отправлен»" });
  return c.json(updated);
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
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "subscription", entityId: subscription.id, summary: `Изменена подписка${body.status ? ` — статус ${body.status}` : ""}`, details: body });
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
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "delete", entity: "subscription", entityId: subscription.id, summary: "Удалена подписка" });
  return c.body(null, 204);
});
