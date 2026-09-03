import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { AppError } from "../../utils/errors";
import { endOfDay, parseDateParam } from "../../utils/dates";
import { assertClient, assertLicenseProduct, assertProject } from "../../utils/ownership";
import { audit } from "../audit/audit.service";
import { recordSale, updateSale } from "./sales.service";
import type { AppEnv } from "../../types/hono";

export const salesRouter = new Hono<AppEnv>();

const dateParam = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const d = parseDateParam(v);
    if (d === null) {
      ctx.addIssue({ code: "custom", message: "Некорректная дата в фильтре" });
      return undefined;
    }
    return d;
  });

export const salesQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  licenseProductId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  from: dateParam,
  to: dateParam,
});

export function buildSalesWhere(organizationId: string, q: z.infer<typeof salesQuerySchema>) {
  return {
    organizationId,
    ...(q.clientId ? { clientId: q.clientId } : {}),
    ...(q.licenseProductId ? { licenseProductId: q.licenseProductId } : {}),
    ...(q.q
      ? {
          OR: [
            { client: { name: { contains: q.q, mode: "insensitive" as const } } },
            { licenseProduct: { name: { contains: q.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(q.from || q.to
      ? { saleDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: endOfDay(q.to) } : {}) } }
      : {}),
  };
}

salesRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const q = salesQuerySchema.parse(c.req.query());
  const sales = await prisma.sale.findMany({
    where: buildSalesWhere(auth.organizationId, q),
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      licenseProduct: { select: { id: true, name: true } },
    },
    orderBy: { saleDate: "desc" },
  });
  return c.json(sales);
});

salesRouter.get("/:id", async (c) => {
  const auth = c.get("auth");
  const sale = await prisma.sale.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
    include: {
      client: true,
      project: { select: { id: true, name: true } },
      licenseProduct: true,
      operations: { orderBy: { accrualDate: "desc" } },
    },
  });
  if (!sale) throw new AppError(404, "Продажа не найдена");
  return c.json(sale);
});

const createSchema = z.object({
  clientId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  licenseProductId: z.string().uuid(),
  amount: z.number().positive(),
  saleDate: z.string().datetime().optional(),
  // "Дата окончания работ" — only meaningful for a WORK-type product.
  workEndDate: z.string().datetime().optional().nullable(),
});

salesRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = createSchema.parse(await c.req.json());
  const organizationId = auth.organizationId;

  const [client, product] = await Promise.all([
    assertClient(organizationId, body.clientId),
    assertLicenseProduct(organizationId, body.licenseProductId),
  ]);

  if (body.projectId) {
    const project = await assertProject(organizationId, body.projectId);
    if (project.clientId !== body.clientId) {
      throw new AppError(400, "Проект принадлежит другому клиенту");
    }
  }

  const saleDate = body.saleDate ? new Date(body.saleDate) : new Date();

  const result = await recordSale({
    organizationId,
    clientId: body.clientId,
    projectId: body.projectId ?? null,
    licenseProductId: body.licenseProductId,
    amount: body.amount,
    saleDate,
    // A work end date only means something for a one-off job.
    workEndDate: product.type === "WORK" && body.workEndDate ? new Date(body.workEndDate) : null,
    vendorSharePercent: Number(product.defaultVendorSharePercent),
    taxable: product.defaultTaxable,
    categoryValueId: product.categoryValueId,
    clientName: client.name,
    productName: product.name,
    userId: auth.userId,
  });

  audit({ organizationId, userId: auth.userId, action: "create", entity: "sale", entityId: result.sale.id, summary: `Продажа: ${client.name} — ${product.name}, ${body.amount} ₽` });
  return c.json(result, 201);
});

const updateSchema = z.object({
  clientId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional().nullable(),
  licenseProductId: z.string().uuid().optional(),
  amount: z.number().positive().optional(),
  saleDate: z.string().datetime().optional(),
  workEndDate: z.string().datetime().optional().nullable(),
});

salesRouter.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const body = updateSchema.parse(await c.req.json());
  const organizationId = auth.organizationId;

  const sale = await prisma.sale.findFirst({ where: { id: c.req.param("id"), organizationId } });
  if (!sale) throw new AppError(404, "Продажа не найдена");

  const clientId = body.clientId ?? sale.clientId;
  const projectId = body.projectId !== undefined ? body.projectId : sale.projectId;
  const licenseProductId = body.licenseProductId ?? sale.licenseProductId;

  const [client, product] = await Promise.all([
    assertClient(organizationId, clientId),
    assertLicenseProduct(organizationId, licenseProductId),
  ]);

  if (projectId) {
    const project = await assertProject(organizationId, projectId);
    if (project.clientId !== clientId) {
      throw new AppError(400, "Проект принадлежит другому клиенту");
    }
  }

  // Only re-derive the waterfall terms from the product's CURRENT defaults
  // when the product itself is being changed — otherwise this sale keeps
  // its original snapshot (e.g. fixing just the amount or date shouldn't
  // silently pick up unrelated catalog changes made since the sale).
  const productChanged = licenseProductId !== sale.licenseProductId;
  const vendorSharePercent = productChanged ? Number(product.defaultVendorSharePercent) : Number(sale.vendorSharePercent);
  const taxable = productChanged ? product.defaultTaxable : sale.taxable;

  const amount = body.amount ?? Number(sale.amount);
  const saleDate = body.saleDate ? new Date(body.saleDate) : sale.saleDate;
  const requestedWorkEndDate = body.workEndDate !== undefined ? (body.workEndDate ? new Date(body.workEndDate) : null) : sale.workEndDate;
  const workEndDate = product.type === "WORK" ? requestedWorkEndDate : null;

  const result = await updateSale({
    organizationId,
    saleId: sale.id,
    clientId,
    projectId,
    licenseProductId,
    amount,
    saleDate,
    workEndDate,
    vendorSharePercent,
    taxable,
    categoryValueId: productChanged ? product.categoryValueId : undefined,
    clientName: client.name,
    productName: product.name,
    userId: auth.userId,
  });

  audit({ organizationId, userId: auth.userId, action: "update", entity: "sale", entityId: sale.id, summary: `Изменена продажа: ${client.name} — ${product.name}, ${amount} ₽`, details: body });
  return c.json(result);
});

salesRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const sale = await prisma.sale.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!sale) throw new AppError(404, "Продажа не найдена");
  await prisma.sale.delete({ where: { id: sale.id } });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "delete", entity: "sale", entityId: sale.id, summary: `Удалена продажа на ${Number(sale.amount)} ₽` });
  return c.body(null, 204);
});
