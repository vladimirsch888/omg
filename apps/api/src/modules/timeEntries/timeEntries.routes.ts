import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler, HttpError } from "../../utils/asyncHandler";

export const timeEntriesRouter = Router();
timeEntriesRouter.use(requireAuth);

timeEntriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, requestId, userId } = req.query;
    const entries = await prisma.timeEntry.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        ...(projectId ? { projectId: String(projectId) } : {}),
        ...(requestId ? { requestId: String(requestId) } : {}),
        ...(userId ? { userId: String(userId) } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        request: { select: { id: true, title: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    });
    res.json(entries);
  })
);

const timeEntrySchema = z.object({
  projectId: z.string().uuid(),
  requestId: z.string().uuid().optional().nullable(),
  date: z.string().datetime(),
  hours: z.number().positive().max(24),
  description: z.string().optional(),
});

timeEntriesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = timeEntrySchema.parse(req.body);
    const organizationId = req.auth!.organizationId;
    const project = await prisma.project.findFirst({ where: { id: body.projectId, organizationId } });
    if (!project) throw new HttpError(404, "Проект не найден");

    if (body.requestId) {
      const request = await prisma.request.findFirst({
        where: { id: body.requestId, organizationId, projectId: body.projectId },
      });
      if (!request) throw new HttpError(404, "Заявка не найдена в этом проекте");
    }

    const entry = await prisma.timeEntry.create({
      data: { ...body, organizationId, userId: req.auth!.userId },
    });
    res.status(201).json(entry);
  })
);

timeEntriesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = timeEntrySchema.partial().parse(req.body);
    const entry = await prisma.timeEntry.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!entry) throw new HttpError(404, "Запись не найдена");
    const updated = await prisma.timeEntry.update({ where: { id: entry.id }, data: body });
    res.json(updated);
  })
);

timeEntriesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const entry = await prisma.timeEntry.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!entry) throw new HttpError(404, "Запись не найдена");
    await prisma.timeEntry.delete({ where: { id: entry.id } });
    res.status(204).end();
  })
);
