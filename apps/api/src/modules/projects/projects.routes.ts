import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler, HttpError } from "../../utils/asyncHandler";
import { getProjectAndDescendantIds } from "./projects.service";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

// Full project tree (top-level projects with their subprojects nested).
projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { clientId } = req.query;
    const projects = await prisma.project.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        parentId: null,
        ...(clientId ? { clientId: String(clientId) } : {}),
      },
      include: {
        client: { select: { id: true, name: true } },
        typeValue: true,
        children: { include: { typeValue: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(projects);
  })
);

projectsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
      include: {
        client: true,
        typeValue: true,
        parent: true,
        children: { include: { typeValue: true } },
      },
    });
    if (!project) throw new HttpError(404, "Проект не найден");
    res.json(project);
  })
);

const projectSchema = z.object({
  clientId: z.string().uuid(),
  parentId: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional(),
  typeValueId: z.string().uuid().optional().nullable(),
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED"]).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  hourlyRate: z.number().nonnegative().optional().nullable(),
  budgetHours: z.number().nonnegative().optional().nullable(),
});

projectsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = projectSchema.parse(req.body);
    const organizationId = req.auth!.organizationId;

    const client = await prisma.client.findFirst({ where: { id: body.clientId, organizationId } });
    if (!client) throw new HttpError(404, "Клиент не найден");

    if (body.parentId) {
      const parent = await prisma.project.findFirst({
        where: { id: body.parentId, organizationId },
      });
      if (!parent) throw new HttpError(404, "Родительский проект не найден");
      if (parent.parentId) {
        throw new HttpError(
          400,
          "Максимальная вложенность: клиент -> проект -> подпроект. У подпроекта не может быть своих подпроектов"
        );
      }
      if (parent.clientId !== body.clientId) {
        throw new HttpError(400, "Подпроект должен принадлежать тому же клиенту, что и родитель");
      }
    }

    const project = await prisma.project.create({
      data: {
        organizationId,
        clientId: body.clientId,
        parentId: body.parentId ?? null,
        name: body.name,
        description: body.description,
        typeValueId: body.typeValueId ?? null,
        status: body.status ?? "ACTIVE",
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        hourlyRate: body.hourlyRate ?? null,
        budgetHours: body.budgetHours ?? null,
      },
    });
    res.status(201).json(project);
  })
);

projectsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = projectSchema.partial().parse(req.body);
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!project) throw new HttpError(404, "Проект не найден");
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: body,
    });
    res.json(updated);
  })
);

projectsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!project) throw new HttpError(404, "Проект не найден");
    await prisma.project.delete({ where: { id: project.id } });
    res.status(204).end();
  })
);

// Aggregated financials & hours for a project, rolled up from its subprojects.
projectsRouter.get(
  "/:id/summary",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const project = await prisma.project.findFirst({ where: { id: req.params.id, organizationId } });
    if (!project) throw new HttpError(404, "Проект не найден");

    const projectIds = await getProjectAndDescendantIds(organizationId, project.id);

    const [incomeAgg, expenseAgg, hoursAgg] = await Promise.all([
      prisma.operation.aggregate({
        where: { organizationId, projectId: { in: projectIds }, type: "INCOME" },
        _sum: { amount: true },
      }),
      prisma.operation.aggregate({
        where: { organizationId, projectId: { in: projectIds }, type: "EXPENSE" },
        _sum: { amount: true },
      }),
      prisma.timeEntry.aggregate({
        where: { organizationId, projectId: { in: projectIds } },
        _sum: { hours: true },
      }),
    ]);

    const income = Number(incomeAgg._sum.amount ?? 0);
    const expense = Number(expenseAgg._sum.amount ?? 0);

    res.json({
      projectId: project.id,
      includedProjectIds: projectIds,
      income,
      expense,
      profit: income - expense,
      hours: Number(hoursAgg._sum.hours ?? 0),
    });
  })
);
