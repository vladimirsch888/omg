import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import type { AppEnv } from "../../types/hono";

export const operationsRouter = new Hono<AppEnv>();
operationsRouter.use(requireAuth);

const listQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

operationsRouter.get("/", async (c) => {
  const q = listQuerySchema.parse(c.req.query());
  const auth = c.get("auth");
  const organizationId = auth.organizationId;

  const where: any = { organizationId };
  if (q.projectId) where.projectId = q.projectId;
  if (q.clientId) where.project = { clientId: q.clientId };
  if (q.type) where.type = q.type;
  if (q.from || q.to) {
    where.accrualDate = {};
    if (q.from) where.accrualDate.gte = new Date(q.from);
    if (q.to) where.accrualDate.lte = new Date(q.to);
  }

  const [items, total] = await Promise.all([
    prisma.operation.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, clientId: true, client: { select: { name: true } } } },
        categoryValue: true,
        paymentMethodValue: true,
      },
      orderBy: { accrualDate: "desc" },
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
  amount: z.number().positive(),
  currency: z.string().optional(),
  accrualDate: z.string().datetime(),
  paymentDate: z.string().datetime().optional().nullable(),
  categoryValueId: z.string().uuid().optional().nullable(),
  paymentMethodValueId: z.string().uuid().optional().nullable(),
  counterparty: z.string().optional(),
  description: z.string().optional(),
});

operationsRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = operationSchema.parse(await c.req.json());
  const organizationId = auth.organizationId;

  if (body.projectId) {
    const project = await prisma.project.findFirst({ where: { id: body.projectId, organizationId } });
    if (!project) throw new AppError(404, "Проект не найден");
  }

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
      counterparty: body.counterparty,
      description: body.description,
      createdById: auth.userId,
    },
  });
  return c.json(operation, 201);
});

operationsRouter.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const body = operationSchema.partial().parse(await c.req.json());
  const operation = await prisma.operation.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!operation) throw new AppError(404, "Операция не найдена");
  const updated = await prisma.operation.update({ where: { id: operation.id }, data: body });
  return c.json(updated);
});

operationsRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const operation = await prisma.operation.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!operation) throw new AppError(404, "Операция не найдена");
  await prisma.operation.delete({ where: { id: operation.id } });
  return c.body(null, 204);
});
