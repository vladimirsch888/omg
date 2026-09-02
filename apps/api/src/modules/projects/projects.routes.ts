import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import { buildProjectTimeline, getProjectAndDescendantIds } from "./projects.service";
import type { AppEnv } from "../../types/hono";

export const projectsRouter = new Hono<AppEnv>();
projectsRouter.use(requireAuth);

// Full project tree (top-level projects with their subprojects nested).
projectsRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const clientId = c.req.query("clientId");
  const projects = await prisma.project.findMany({
    where: {
      organizationId: auth.organizationId,
      parentId: null,
      ...(clientId ? { clientId } : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      typeValue: true,
      children: { include: { typeValue: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json(projects);
});

projectsRouter.get("/:id", async (c) => {
  const auth = c.get("auth");
  const project = await prisma.project.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
    include: {
      client: true,
      typeValue: true,
      parent: true,
      children: { include: { typeValue: true } },
    },
  });
  if (!project) throw new AppError(404, "Проект не найден");
  return c.json(project);
});

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

projectsRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = projectSchema.parse(await c.req.json());
  const organizationId = auth.organizationId;

  const client = await prisma.client.findFirst({ where: { id: body.clientId, organizationId } });
  if (!client) throw new AppError(404, "Клиент не найден");

  if (body.parentId) {
    const parent = await prisma.project.findFirst({
      where: { id: body.parentId, organizationId },
    });
    if (!parent) throw new AppError(404, "Родительский проект не найден");
    if (parent.parentId) {
      throw new AppError(
        400,
        "Максимальная вложенность: клиент -> проект -> подпроект. У подпроекта не может быть своих подпроектов"
      );
    }
    if (parent.clientId !== body.clientId) {
      throw new AppError(400, "Подпроект должен принадлежать тому же клиенту, что и родитель");
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
  return c.json(project, 201);
});

projectsRouter.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const body = projectSchema.partial().parse(await c.req.json());
  const project = await prisma.project.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!project) throw new AppError(404, "Проект не найден");
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: body,
  });
  return c.json(updated);
});

projectsRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const project = await prisma.project.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!project) throw new AppError(404, "Проект не найден");
  await prisma.project.delete({ where: { id: project.id } });
  return c.body(null, 204);
});

// Aggregated financials & hours for a project, rolled up from its subprojects.
projectsRouter.get("/:id/summary", async (c) => {
  const auth = c.get("auth");
  const organizationId = auth.organizationId;
  const project = await prisma.project.findFirst({ where: { id: c.req.param("id"), organizationId } });
  if (!project) throw new AppError(404, "Проект не найден");

  const projectIds = await getProjectAndDescendantIds(organizationId, project.id);

  const [incomeAgg, expenseAgg, hoursAgg, operationDates, timeEntryDates, requestDates] = await Promise.all([
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
    // Real activity on the project, used to bracket its actual timeline.
    prisma.operation.aggregate({
      where: { organizationId, projectId: { in: projectIds } },
      _min: { accrualDate: true },
      _max: { accrualDate: true },
    }),
    prisma.timeEntry.aggregate({
      where: { organizationId, projectId: { in: projectIds } },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.request.aggregate({
      where: { organizationId, projectId: { in: projectIds } },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
  ]);

  const income = Number(incomeAgg._sum.amount ?? 0);
  const expense = Number(expenseAgg._sum.amount ?? 0);

  const earliest = (dates: (Date | null)[]) => {
    const known = dates.filter((d): d is Date => d !== null);
    return known.length > 0 ? new Date(Math.min(...known.map((d) => d.getTime()))) : null;
  };
  const latest = (dates: (Date | null)[]) => {
    const known = dates.filter((d): d is Date => d !== null);
    return known.length > 0 ? new Date(Math.max(...known.map((d) => d.getTime()))) : null;
  };

  const timeline = buildProjectTimeline({
    startDate: project.startDate,
    endDate: project.endDate,
    isFinished: project.status === "CLOSED",
    firstActivityAt: earliest([
      operationDates._min.accrualDate,
      timeEntryDates._min.date,
      requestDates._min.createdAt,
    ]),
    lastActivityAt: latest([
      operationDates._max.accrualDate,
      timeEntryDates._max.date,
      requestDates._max.createdAt,
    ]),
  });

  return c.json({
    projectId: project.id,
    includedProjectIds: projectIds,
    income,
    expense,
    profit: income - expense,
    hours: Number(hoursAgg._sum.hours ?? 0),
    timeline,
  });
});
