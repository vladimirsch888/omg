import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler, HttpError } from "../../utils/asyncHandler";

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

clientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const clients = await prisma.client.findMany({
      where: { organizationId: req.auth!.organizationId },
      include: { projects: { where: { parentId: null }, select: { id: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      clients.map((c) => ({
        ...c,
        projects: undefined,
        projectsCount: c.projects.length,
      }))
    );
  })
);

clientsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
      include: {
        projects: {
          where: { parentId: null },
          include: { children: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!client) throw new HttpError(404, "Клиент не найден");
    res.json(client);
  })
);

const clientSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  inn: z.string().optional(),
  contactPerson: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CHURNED"]).optional(),
  notes: z.string().optional(),
});

clientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = clientSchema.parse(req.body);
    const client = await prisma.client.create({
      data: { ...body, organizationId: req.auth!.organizationId },
    });
    res.status(201).json(client);
  })
);

clientsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = clientSchema.partial().parse(req.body);
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!client) throw new HttpError(404, "Клиент не найден");
    const updated = await prisma.client.update({ where: { id: client.id }, data: body });
    res.json(updated);
  })
);

clientsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!client) throw new HttpError(404, "Клиент не найден");
    await prisma.client.delete({ where: { id: client.id } });
    res.status(204).end();
  })
);
