import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import type { AppEnv } from "../../types/hono";

export const clientsRouter = new Hono<AppEnv>();
clientsRouter.use(requireAuth);

clientsRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const clients = await prisma.client.findMany({
    where: { organizationId: auth.organizationId },
    include: { projects: { where: { parentId: null }, select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });
  return c.json(
    clients.map((cl) => ({
      ...cl,
      projects: undefined,
      projectsCount: cl.projects.length,
    }))
  );
});

clientsRouter.get("/:id", async (c) => {
  const auth = c.get("auth");
  const client = await prisma.client.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
    include: {
      projects: {
        where: { parentId: null },
        include: { children: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!client) throw new AppError(404, "Клиент не найден");
  return c.json(client);
});

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

clientsRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = clientSchema.parse(await c.req.json());
  const client = await prisma.client.create({
    data: { ...body, organizationId: auth.organizationId },
  });
  return c.json(client, 201);
});

clientsRouter.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const body = clientSchema.partial().parse(await c.req.json());
  const client = await prisma.client.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!client) throw new AppError(404, "Клиент не найден");
  const updated = await prisma.client.update({ where: { id: client.id }, data: body });
  return c.json(updated);
});

clientsRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const client = await prisma.client.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!client) throw new AppError(404, "Клиент не найден");
  await prisma.client.delete({ where: { id: client.id } });
  return c.body(null, 204);
});
