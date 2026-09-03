import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { AppError } from "../../utils/errors";
import { endOfDay, parseDateParam } from "../../utils/dates";
import { assertDictionaryValue, assertProject } from "../../utils/ownership";
import { audit } from "../audit/audit.service";
import type { AppEnv } from "../../types/hono";

export const operationsRouter = new Hono<AppEnv>();

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

export const listQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  status: z.enum(["PLANNED", "ACTUAL"]).optional(),
  categoryValueId: z.string().uuid().optional(),
  accountValueId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  from: dateParam,
  to: dateParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export function buildOperationsWhere(organizationId: string, q: z.infer<typeof listQuerySchema>) {
  const where: Record<string, unknown> = { organizationId };
  if (q.projectId) where.projectId = q.projectId;
  // A client filter must catch project-less sales/subscriptions too.
  if (q.clientId) {
    where.OR = [
      { project: { clientId: q.clientId } },
      { subscription: { clientId: q.clientId } },
      { sale: { clientId: q.clientId } },
    ];
  }
  if (q.type) where.type = q.type;
  if (q.status) where.status = q.status;
  if (q.categoryValueId) where.categoryValueId = q.categoryValueId;
  if (q.accountValueId) where.accountValueId = q.accountValueId;
  if (q.q) {
    where.AND = [
      {
        OR: [
          { description: { contains: q.q, mode: "insensitive" } },
          { counterparty: { contains: q.q, mode: "insensitive" } },
        ],
      },
    ];
  }
  if (q.from || q.to) {
    where.accrualDate = {
      ...(q.from ? { gte: q.from } : {}),
      // "to" is a calendar day, so it must include the whole of that day.
      ...(q.to ? { lte: endOfDay(q.to) } : {}),
    };
  }
  return where;
}

operationsRouter.get("/", async (c) => {
  const q = listQuerySchema.parse(c.req.query());
  const auth = c.get("auth");
  const where = buildOperationsWhere(auth.organizationId, q);

  const [items, total] = await Promise.all([
    prisma.operation.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, clientId: true, client: { select: { name: true } } } },
        categoryValue: true,
        paymentMethodValue: true,
        accountValue: true,
      },
      orderBy: [{ accrualDate: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.operation.count({ where }),
  ]);

  return c.json({ items, total, page: q.page, pageSize: q.pageSize });
});

const operationSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  type: z.enum(["INCOME", "EXPENSE"]),
  status: z.enum(["PLANNED", "ACTUAL"]).optional(),
  amount: z.number().positive().max(1_000_000_000),
  currency: z.string().optional(),
  accrualDate: z.string().datetime(),
  paymentDate: z.string().datetime().optional().nullable(),
  categoryValueId: z.string().uuid().optional().nullable(),
  paymentMethodValueId: z.string().uuid().optional().nullable(),
  accountValueId: z.string().uuid().optional().nullable(),
  counterparty: z.string().trim().max(300).optional(),
  description: z.string().trim().max(1000).optional(),
  // Financial waterfall for manually entered income (services have 0% vendor
  // share; untaxed direct "card" transfers set taxable to false).
  vendorSharePercent: z.number().min(0).max(100).optional(),
  taxable: z.boolean().optional(),
  // An EXPENSE that pays the tax the reserve was set aside for.
  taxPayment: z.boolean().optional(),
});

/** Every referenced record must be ours — on create and on update alike. */
async function assertReferences(organizationId: string, body: Partial<z.infer<typeof operationSchema>>) {
  if (body.projectId) await assertProject(organizationId, body.projectId);
  if (body.categoryValueId) await assertDictionaryValue(organizationId, body.categoryValueId, "operation_category", "Категория");
  if (body.paymentMethodValueId) await assertDictionaryValue(organizationId, body.paymentMethodValueId, "payment_method", "Способ оплаты");
  if (body.accountValueId) await assertDictionaryValue(organizationId, body.accountValueId, "account", "Счёт");
}

operationsRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = operationSchema.parse(await c.req.json());
  const organizationId = auth.organizationId;
  await assertReferences(organizationId, body);
  if (body.taxPayment && body.type !== "EXPENSE") throw new AppError(400, "Уплата налога — это расход");

  const operation = await prisma.operation.create({
    data: {
      organizationId,
      projectId: body.projectId ?? null,
      type: body.type,
      status: body.status ?? "ACTUAL",
      amount: body.amount,
      currency: body.currency ?? "RUB",
      accrualDate: body.accrualDate,
      paymentDate: body.paymentDate ?? null,
      categoryValueId: body.categoryValueId ?? null,
      paymentMethodValueId: body.paymentMethodValueId ?? null,
      accountValueId: body.accountValueId ?? null,
      counterparty: body.counterparty,
      description: body.description,
      vendorSharePercent: body.type === "INCOME" ? (body.vendorSharePercent ?? 0) : 0,
      taxable: body.type === "INCOME" ? (body.taxable ?? true) : true,
      taxPayment: body.type === "EXPENSE" ? (body.taxPayment ?? false) : false,
      createdById: auth.userId,
    },
  });
  audit({ organizationId, userId: auth.userId, action: "create", entity: "operation", entityId: operation.id, summary: `${body.type === "INCOME" ? "Доход" : "Расход"} ${body.amount} ₽${body.description ? ` — ${body.description}` : ""}` });
  return c.json(operation, 201);
});

operationsRouter.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const body = operationSchema.partial().parse(await c.req.json());
  const operation = await prisma.operation.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!operation) throw new AppError(404, "Операция не найдена");
  await assertReferences(auth.organizationId, body);
  const type = body.type ?? operation.type;
  if ((body.taxPayment ?? operation.taxPayment) && type !== "EXPENSE") throw new AppError(400, "Уплата налога — это расход");

  const updated = await prisma.operation.update({ where: { id: operation.id }, data: body });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "operation", entityId: operation.id, summary: `Изменена операция ${Number(updated.amount)} ₽${updated.description ? ` — ${updated.description}` : ""}`, details: body });
  return c.json(updated);
});

operationsRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const operation = await prisma.operation.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!operation) throw new AppError(404, "Операция не найдена");
  await prisma.operation.delete({ where: { id: operation.id } });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "delete", entity: "operation", entityId: operation.id, summary: `Удалена операция ${Number(operation.amount)} ₽${operation.description ? ` — ${operation.description}` : ""}` });
  return c.body(null, 204);
});

/** Bulk delete for the list's multi-select; only the caller's own rows go. */
operationsRouter.post("/bulk-delete", async (c) => {
  const auth = c.get("auth");
  const body = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(await c.req.json());
  const result = await prisma.operation.deleteMany({
    where: { id: { in: body.ids }, organizationId: auth.organizationId },
  });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "delete", entity: "operation", summary: `Массово удалено операций: ${result.count}` });
  return c.json({ deleted: result.count });
});
