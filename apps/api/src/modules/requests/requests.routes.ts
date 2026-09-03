import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { AppError } from "../../utils/errors";
import { assertDictionaryValue, assertProject } from "../../utils/ownership";
import { audit } from "../audit/audit.service";
import type { AppEnv } from "../../types/hono";

export const requestsRouter = new Hono<AppEnv>();

const statusSchema = z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]);
const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

const listQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  q: z.string().trim().max(200).optional(),
});

requestsRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const q = listQuerySchema.parse(c.req.query());
  const requests = await prisma.request.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.q ? { title: { contains: q.q, mode: "insensitive" } } : {}),
    },
    include: {
      project: { select: { id: true, name: true, clientId: true } },
      requestTypeValue: true,
      timeEntries: { select: { hours: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json(
    requests.map((r) => ({
      ...r,
      totalHours: r.timeEntries.reduce((sum, t) => sum + Number(t.hours), 0),
      timeEntries: undefined,
    }))
  );
});

const requestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  requestTypeValueId: z.string().uuid().optional().nullable(),
});

requestsRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = requestSchema.parse(await c.req.json());
  const organizationId = auth.organizationId;
  await assertProject(organizationId, body.projectId);
  if (body.requestTypeValueId) await assertDictionaryValue(organizationId, body.requestTypeValueId, "request_type", "Тип заявки");

  const request = await prisma.request.create({
    data: { ...body, organizationId },
  });
  audit({ organizationId, userId: auth.userId, action: "create", entity: "request", entityId: request.id, summary: `Создана заявка «${request.title}»` });
  return c.json(request, 201);
});

requestsRouter.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const body = requestSchema.partial().parse(await c.req.json());
  const request = await prisma.request.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!request) throw new AppError(404, "Заявка не найдена");
  if (body.projectId) await assertProject(auth.organizationId, body.projectId);
  if (body.requestTypeValueId) await assertDictionaryValue(auth.organizationId, body.requestTypeValueId, "request_type", "Тип заявки");

  const data: Record<string, unknown> = { ...body };
  if (body.status === "DONE" && request.status !== "DONE") {
    data.closedAt = new Date();
  } else if (body.status && body.status !== "DONE" && request.status === "DONE") {
    data.closedAt = null;
  }

  const updated = await prisma.request.update({ where: { id: request.id }, data });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "request", entityId: request.id, summary: `Изменена заявка «${updated.title}»${body.status ? ` — статус ${body.status}` : ""}`, details: body });
  return c.json(updated);
});

requestsRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const request = await prisma.request.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!request) throw new AppError(404, "Заявка не найдена");
  await prisma.request.delete({ where: { id: request.id } });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "delete", entity: "request", entityId: request.id, summary: `Удалена заявка «${request.title}»` });
  return c.body(null, 204);
});
