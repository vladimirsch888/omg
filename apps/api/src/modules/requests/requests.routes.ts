import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler, HttpError } from "../../utils/asyncHandler";

export const requestsRouter = Router();
requestsRouter.use(requireAuth);

requestsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, status } = req.query;
    const requests = await prisma.request.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        ...(projectId ? { projectId: String(projectId) } : {}),
        ...(status ? { status: String(status) as any } : {}),
      },
      include: {
        project: { select: { id: true, name: true, clientId: true } },
        requestTypeValue: true,
        timeEntries: { select: { hours: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      requests.map((r) => ({
        ...r,
        totalHours: r.timeEntries.reduce((sum, t) => sum + Number(t.hours), 0),
        timeEntries: undefined,
      }))
    );
  })
);

const requestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  requestTypeValueId: z.string().uuid().optional().nullable(),
});

requestsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = requestSchema.parse(req.body);
    const organizationId = req.auth!.organizationId;
    const project = await prisma.project.findFirst({ where: { id: body.projectId, organizationId } });
    if (!project) throw new HttpError(404, "Проект не найден");

    const request = await prisma.request.create({
      data: { ...body, organizationId },
    });
    res.status(201).json(request);
  })
);

requestsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = requestSchema.partial().parse(req.body);
    const request = await prisma.request.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!request) throw new HttpError(404, "Заявка не найдена");

    const data: any = { ...body };
    if (body.status === "DONE" && request.status !== "DONE") {
      data.closedAt = new Date();
    }

    const updated = await prisma.request.update({ where: { id: request.id }, data });
    res.json(updated);
  })
);

requestsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const request = await prisma.request.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!request) throw new HttpError(404, "Заявка не найдена");
    await prisma.request.delete({ where: { id: request.id } });
    res.status(204).end();
  })
);
