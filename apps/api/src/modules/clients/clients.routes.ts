import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { AppError } from "../../utils/errors";
import { audit } from "../audit/audit.service";
import type { AppEnv } from "../../types/hono";

export const clientsRouter = new Hono<AppEnv>();

const listQuerySchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CHURNED"]).optional(),
  q: z.string().trim().max(200).optional(),
});

clientsRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const q = listQuerySchema.parse(c.req.query());
  const clients = await prisma.client.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: "insensitive" } },
              { legalName: { contains: q.q, mode: "insensitive" } },
              { inn: { contains: q.q } },
              { contactPerson: { contains: q.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
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
      subscriptions: {
        include: {
          licenseProduct: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { nextBillingDate: "asc" },
      },
    },
  });
  if (!client) throw new AppError(404, "Клиент не найден");
  return c.json(client);
});

const optionalText = z.string().trim().max(500).optional();

const clientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  legalName: optionalText,
  inn: z.string().trim().max(20).regex(/^\d*$/, "ИНН — только цифры").optional(),
  contactPerson: optionalText,
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  contactPhone: optionalText,
  status: z.enum(["ACTIVE", "PAUSED", "CHURNED"]).optional(),
  notes: z.string().trim().max(5000).optional(),
});

clientsRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = clientSchema.parse(await c.req.json());
  const client = await prisma.client.create({
    data: { ...body, organizationId: auth.organizationId },
  });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "create", entity: "client", entityId: client.id, summary: `Создан клиент «${client.name}»` });
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
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "client", entityId: client.id, summary: `Изменён клиент «${updated.name}»`, details: body });
  return c.json(updated);
});

/**
 * Deleting a client cascades to its projects, subscriptions and sales; its
 * operations stay (as company-level records) so the money history survives.
 * The response tells the UI how much is about to go, for an honest confirm.
 */
clientsRouter.get("/:id/delete-impact", async (c) => {
  const auth = c.get("auth");
  const client = await prisma.client.findFirst({ where: { id: c.req.param("id"), organizationId: auth.organizationId } });
  if (!client) throw new AppError(404, "Клиент не найден");
  const [projects, subscriptions, sales, operations] = await Promise.all([
    prisma.project.count({ where: { clientId: client.id } }),
    prisma.subscription.count({ where: { clientId: client.id } }),
    prisma.sale.count({ where: { clientId: client.id } }),
    prisma.operation.count({
      where: {
        organizationId: auth.organizationId,
        OR: [{ project: { clientId: client.id } }, { subscription: { clientId: client.id } }, { sale: { clientId: client.id } }],
      },
    }),
  ]);
  return c.json({ projects, subscriptions, sales, operations });
});

clientsRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const client = await prisma.client.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!client) throw new AppError(404, "Клиент не найден");
  await prisma.client.delete({ where: { id: client.id } });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "delete", entity: "client", entityId: client.id, summary: `Удалён клиент «${client.name}»` });
  return c.body(null, 204);
});
