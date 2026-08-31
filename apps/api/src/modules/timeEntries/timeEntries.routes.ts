import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import type { AppEnv } from "../../types/hono";

export const timeEntriesRouter = new Hono<AppEnv>();
timeEntriesRouter.use(requireAuth);

timeEntriesRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.query("projectId");
  const requestId = c.req.query("requestId");
  const userId = c.req.query("userId");
  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(projectId ? { projectId } : {}),
      ...(requestId ? { requestId } : {}),
      ...(userId ? { userId } : {}),
    },
    include: {
      project: { select: { id: true, name: true } },
      request: { select: { id: true, title: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });
  return c.json(entries);
});

const timeEntrySchema = z.object({
  projectId: z.string().uuid(),
  requestId: z.string().uuid().optional().nullable(),
  date: z.string().datetime(),
  hours: z.number().positive().max(24),
  description: z.string().optional(),
});

timeEntriesRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = timeEntrySchema.parse(await c.req.json());
  const organizationId = auth.organizationId;
  const project = await prisma.project.findFirst({ where: { id: body.projectId, organizationId } });
  if (!project) throw new AppError(404, "Проект не найден");

  if (body.requestId) {
    const request = await prisma.request.findFirst({
      where: { id: body.requestId, organizationId, projectId: body.projectId },
    });
    if (!request) throw new AppError(404, "Заявка не найдена в этом проекте");
  }

  const entry = await prisma.timeEntry.create({
    data: { ...body, organizationId, userId: auth.userId },
  });
  return c.json(entry, 201);
});

timeEntriesRouter.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const body = timeEntrySchema.partial().parse(await c.req.json());
  const entry = await prisma.timeEntry.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!entry) throw new AppError(404, "Запись не найдена");
  const updated = await prisma.timeEntry.update({ where: { id: entry.id }, data: body });
  return c.json(updated);
});

timeEntriesRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const entry = await prisma.timeEntry.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!entry) throw new AppError(404, "Запись не найдена");
  await prisma.timeEntry.delete({ where: { id: entry.id } });
  return c.body(null, 204);
});
