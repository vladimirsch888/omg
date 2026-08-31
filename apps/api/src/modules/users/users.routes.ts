import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import { hashPassword } from "../../utils/password";
import type { AppEnv } from "../../types/hono";

export const usersRouter = new Hono<AppEnv>();
usersRouter.use(requireAuth);

usersRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const users = await prisma.user.findMany({
    where: { organizationId: auth.organizationId },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return c.json(users);
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "VIEWER"]).default("MANAGER"),
});

usersRouter.post("/", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const body = createSchema.parse(await c.req.json());
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw new AppError(409, "Пользователь с таким email уже существует");

  const passwordHash = await hashPassword(body.password);
  const user = await prisma.user.create({
    data: {
      organizationId: auth.organizationId,
      email: body.email,
      passwordHash,
      name: body.name,
      role: body.role,
    },
  });
  return c.json({ id: user.id, email: user.email, name: user.name, role: user.role }, 201);
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

usersRouter.patch("/:id", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const body = updateSchema.parse(await c.req.json());
  const user = await prisma.user.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!user) throw new AppError(404, "Пользователь не найден");

  const data: Record<string, unknown> = {
    name: body.name,
    role: body.role,
    isActive: body.isActive,
  };
  if (body.password) {
    data.passwordHash = await hashPassword(body.password);
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return c.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role, isActive: updated.isActive });
});
