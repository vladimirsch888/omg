import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { AppError } from "../../utils/errors";
import { assertClient, assertDictionaryValue } from "../../utils/ownership";
import { audit } from "../audit/audit.service";
import { buildProjectTimeline, getProjectAndDescendantIds } from "./projects.service";
import type { AppEnv } from "../../types/hono";

export const projectsRouter = new Hono<AppEnv>();

// Full project tree (top-level projects with their subprojects nested).
projectsRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const clientId = c.req.query("clientId");
  const status = c.req.query("status");
  const parsedStatus = z.enum(["ACTIVE", "PAUSED", "CLOSED"]).optional().parse(status || undefined);
  const projects = await prisma.project.findMany({
    where: {
      organizationId: auth.organizationId,
      parentId: null,
      ...(clientId ? { clientId } : {}),
      ...(parsedStatus ? { status: parsedStatus } : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      typeValue: true,
      children: { include: { typeValue: true }, orderBy: { createdAt: "asc" } },
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
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  typeValueId: z.string().uuid().optional().nullable(),
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED"]).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  hourlyRate: z.number().nonnegative().optional().nullable(),
  budgetHours: z.number().nonnegative().optional().nullable(),
});

/**
 * The tree rules, applied on create AND on every update that touches
 * clientId/parentId: depth is client → project → subproject, a subproject
 * belongs to its parent's client, a project can't be its own ancestor, and
 * a project that already has subprojects can't itself become one.
 */
async function validateTreePlacement(
  organizationId: string,
  input: { id?: string; clientId: string; parentId: string | null }
) {
  await assertClient(organizationId, input.clientId);

  if (input.parentId) {
    if (input.id && input.parentId === input.id) {
      throw new AppError(400, "Проект не может быть родителем самого себя");
    }
    const parent = await prisma.project.findFirst({ where: { id: input.parentId, organizationId } });
    if (!parent) throw new AppError(404, "Родительский проект не найден");
    if (parent.parentId) {
      throw new AppError(
        400,
        "Максимальная вложенность: клиент -> проект -> подпроект. У подпроекта не может быть своих подпроектов"
      );
    }
    if (parent.clientId !== input.clientId) {
      throw new AppError(400, "Подпроект должен принадлежать тому же клиенту, что и родитель");
    }
    if (input.id) {
      const children = await prisma.project.count({ where: { parentId: input.id } });
      if (children > 0) {
        throw new AppError(400, "У этого проекта есть подпроекты — он не может стать подпроектом");
      }
    }
  }
}

projectsRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = projectSchema.parse(await c.req.json());
  const organizationId = auth.organizationId;

  await validateTreePlacement(organizationId, { clientId: body.clientId, parentId: body.parentId ?? null });
  if (body.typeValueId) await assertDictionaryValue(organizationId, body.typeValueId, "project_type", "Тип проекта");

  const project = await prisma.project.create({
    data: {
      organizationId,
      clientId: body.clientId,
      parentId: body.parentId ?? null,
      name: body.name,
      description: body.description ?? null,
      typeValueId: body.typeValueId ?? null,
      status: body.status ?? "ACTIVE",
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      hourlyRate: body.hourlyRate ?? null,
      budgetHours: body.budgetHours ?? null,
    },
  });
  audit({ organizationId, userId: auth.userId, action: "create", entity: "project", entityId: project.id, summary: `Создан проект «${project.name}»` });
  return c.json(project, 201);
});

projectsRouter.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const organizationId = auth.organizationId;
  const body = projectSchema.partial().parse(await c.req.json());
  const project = await prisma.project.findFirst({ where: { id: c.req.param("id"), organizationId } });
  if (!project) throw new AppError(404, "Проект не найден");

  const nextClientId = body.clientId ?? project.clientId;
  const nextParentId = body.parentId !== undefined ? body.parentId : project.parentId;
  if (nextClientId !== project.clientId || nextParentId !== project.parentId) {
    await validateTreePlacement(organizationId, { id: project.id, clientId: nextClientId, parentId: nextParentId });
    // Moving a parent to another client takes its subprojects along, so the
    // "same client as parent" rule keeps holding for them.
    if (nextClientId !== project.clientId) {
      await prisma.project.updateMany({ where: { parentId: project.id }, data: { clientId: nextClientId } });
    }
  }
  if (body.typeValueId) await assertDictionaryValue(organizationId, body.typeValueId, "project_type", "Тип проекта");

  const updated = await prisma.project.update({ where: { id: project.id }, data: body });
  const statusNote =
    body.status && body.status !== project.status
      ? body.status === "CLOSED"
        ? " — завершён"
        : body.status === "ACTIVE" && project.status === "CLOSED"
          ? " — возвращён в работу"
          : ` — статус ${body.status}`
      : "";
  audit({ organizationId, userId: auth.userId, action: "update", entity: "project", entityId: project.id, summary: `Изменён проект «${updated.name}»${statusNote}`, details: body });
  return c.json(updated);
});

projectsRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const project = await prisma.project.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!project) throw new AppError(404, "Проект не найден");
  await prisma.project.delete({ where: { id: project.id } });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "delete", entity: "project", entityId: project.id, summary: `Удалён проект «${project.name}»` });
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
  const hours = Number(hoursAgg._sum.hours ?? 0);

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

  // Hours plan vs fact and what those hours cost at the project's rate — the
  // "did this job pay for itself" figure next to the timeline.
  const budgetHours = project.budgetHours === null ? null : Number(project.budgetHours);
  const hourlyRate = project.hourlyRate === null ? null : Number(project.hourlyRate);
  const effort = {
    hours,
    budgetHours,
    hourlyRate,
    laborCost: hourlyRate !== null ? Math.round(hours * hourlyRate) : null,
    budgetUsedPercent: budgetHours && budgetHours > 0 ? Math.round((hours / budgetHours) * 100) : null,
  };

  return c.json({
    projectId: project.id,
    includedProjectIds: projectIds,
    income,
    expense,
    profit: income - expense,
    hours,
    effort,
    timeline,
  });
});
