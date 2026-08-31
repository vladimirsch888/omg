import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler, HttpError } from "../../utils/asyncHandler";

export const operationsRouter = Router();
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

operationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const organizationId = req.auth!.organizationId;

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

    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  })
);

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

operationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = operationSchema.parse(req.body);
    const organizationId = req.auth!.organizationId;

    if (body.projectId) {
      const project = await prisma.project.findFirst({ where: { id: body.projectId, organizationId } });
      if (!project) throw new HttpError(404, "Проект не найден");
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
        createdById: req.auth!.userId,
      },
    });
    res.status(201).json(operation);
  })
);

operationsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = operationSchema.partial().parse(req.body);
    const operation = await prisma.operation.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!operation) throw new HttpError(404, "Операция не найдена");
    const updated = await prisma.operation.update({ where: { id: operation.id }, data: body });
    res.json(updated);
  })
);

operationsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const operation = await prisma.operation.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!operation) throw new HttpError(404, "Операция не найдена");
    await prisma.operation.delete({ where: { id: operation.id } });
    res.status(204).end();
  })
);
