import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import type { AppEnv } from "../../types/hono";

export const requestsRouter = new Hono<AppEnv>();
requestsRouter.use(requireAuth);

requestsRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.query("projectId");
  const status = c.req.query("status");
  const requests = await prisma.request.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status: status as any } : {}),
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
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  requestTypeValueId: z.string().uuid().optional().nullable(),
});

requestsRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = requestSchema.parse(await c.req.json());
  const organizationId = auth.organizationId;
  const project = await prisma.project.findFirst({ where: { id: body.projectId, organizationId } });
  if (!project) throw new AppError(404, "Проект не найден");

  const request = await prisma.request.create({
    data: { ...body, organizationId },
  });
  return c.json(request, 201);
});

requestsRouter.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const body = requestSchema.partial().parse(await c.req.json());
  const request = await prisma.request.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!request) throw new AppError(404, "Заявка не найдена");

  const data: any = { ...body };
  if (body.status === "DONE" && request.status !== "DONE") {
    data.closedAt = new Date();
  }

  const updated = await prisma.request.update({ where: { id: request.id }, data });
  return c.json(updated);
});

requestsRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const request = await prisma.request.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!request) throw new AppError(404, "Заявка не найдена");
  await prisma.request.delete({ where: { id: request.id } });
  return c.body(null, 204);
});
