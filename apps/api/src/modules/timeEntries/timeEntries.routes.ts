import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { AppError } from "../../utils/errors";
import { endOfDay, parseDateParam } from "../../utils/dates";
import { assertProject, assertRequest } from "../../utils/ownership";
import { audit } from "../audit/audit.service";
import type { AppEnv } from "../../types/hono";

export const timeEntriesRouter = new Hono<AppEnv>();

const dateParam = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const d = parseDateParam(v);
    if (d === null) {
      ctx.addIssue({ code: "custom", message: "Некорректная дата в фильтре" });
      return undefined;
    }
    return d;
  });

export const timeEntriesQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  from: dateParam,
  to: dateParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});

export function buildTimeEntriesWhere(organizationId: string, q: z.infer<typeof timeEntriesQuerySchema>) {
  return {
    organizationId,
    ...(q.projectId ? { projectId: q.projectId } : {}),
    ...(q.requestId ? { requestId: q.requestId } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.from || q.to
      ? { date: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: endOfDay(q.to) } : {}) } }
      : {}),
  };
}

timeEntriesRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const q = timeEntriesQuerySchema.parse(c.req.query());
  const where = buildTimeEntriesWhere(auth.organizationId, q);
  const [items, total, sum] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        request: { select: { id: true, title: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.timeEntry.count({ where }),
    prisma.timeEntry.aggregate({ where, _sum: { hours: true } }),
  ]);
  return c.json({ items, total, page: q.page, pageSize: q.pageSize, totalHours: Number(sum._sum.hours ?? 0) });
});

const timeEntrySchema = z.object({
  projectId: z.string().uuid(),
  requestId: z.string().uuid().optional().nullable(),
  date: z.string().datetime(),
  hours: z.number().positive().max(24),
  description: z.string().trim().max(1000).optional(),
});

timeEntriesRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = timeEntrySchema.parse(await c.req.json());
  const organizationId = auth.organizationId;
  await assertProject(organizationId, body.projectId);
  if (body.requestId) await assertRequest(organizationId, body.requestId, body.projectId);

  const entry = await prisma.timeEntry.create({
    data: { ...body, organizationId, userId: auth.userId },
  });
  audit({ organizationId, userId: auth.userId, action: "create", entity: "timeEntry", entityId: entry.id, summary: `Списано ${body.hours} ч${body.description ? ` — ${body.description}` : ""}` });
  return c.json(entry, 201);
});

timeEntriesRouter.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const body = timeEntrySchema.partial().parse(await c.req.json());
  const entry = await prisma.timeEntry.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!entry) throw new AppError(404, "Запись не найдена");
  const projectId = body.projectId ?? entry.projectId;
  if (body.projectId) await assertProject(auth.organizationId, body.projectId);
  const requestId = body.requestId !== undefined ? body.requestId : entry.requestId;
  if (requestId) await assertRequest(auth.organizationId, requestId, projectId);

  const updated = await prisma.timeEntry.update({ where: { id: entry.id }, data: body });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "timeEntry", entityId: entry.id, summary: `Изменена запись времени (${Number(updated.hours)} ч)`, details: body });
  return c.json(updated);
});

timeEntriesRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const entry = await prisma.timeEntry.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!entry) throw new AppError(404, "Запись не найдена");
  await prisma.timeEntry.delete({ where: { id: entry.id } });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "delete", entity: "timeEntry", entityId: entry.id, summary: `Удалена запись времени (${Number(entry.hours)} ч)` });
  return c.body(null, 204);
});
