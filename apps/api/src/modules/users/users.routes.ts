import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireRole } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import { hashPassword, passwordSchema } from "../../utils/password";
import { audit } from "../audit/audit.service";
import type { AppEnv } from "../../types/hono";

export const usersRouter = new Hono<AppEnv>();

usersRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const users = await prisma.user.findMany({
    where: { organizationId: auth.organizationId },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return c.json(users);
});

const roleSchema = z.enum(["OWNER", "ADMIN", "MANAGER", "VIEWER"]);

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  name: z.string().trim().min(2),
  role: roleSchema.default("MANAGER"),
});

/** Only an owner may hand out the OWNER role — an admin must not promote anyone (or themselves) above their own level. */
function assertMayAssignRole(actorRole: string, role: string) {
  if (role === "OWNER" && actorRole !== "OWNER") {
    throw new AppError(403, "Назначать роль «Владелец» может только владелец");
  }
}

usersRouter.post("/", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const body = createSchema.parse(await c.req.json());
  assertMayAssignRole(auth.role, body.role);
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
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "create", entity: "user", entityId: user.id, summary: `Создан пользователь ${user.email} (${user.role})` });
  return c.json({ id: user.id, email: user.email, name: user.name, role: user.role }, 201);
});

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});

usersRouter.patch("/:id", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const body = updateSchema.parse(await c.req.json());
  const user = await prisma.user.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!user) throw new AppError(404, "Пользователь не найден");

  const isSelf = user.id === auth.userId;
  if (isSelf && body.isActive === false) throw new AppError(400, "Нельзя отключить самого себя");
  if (isSelf && body.role && body.role !== user.role) throw new AppError(400, "Нельзя изменить собственную роль");

  if (body.role) assertMayAssignRole(auth.role, body.role);
  // An admin can't touch an owner's account at all.
  if (user.role === "OWNER" && auth.role !== "OWNER") throw new AppError(403, "Изменять владельца может только владелец");

  // Never leave the organization without an active owner.
  const removesOwner = user.role === "OWNER" && ((body.role && body.role !== "OWNER") || body.isActive === false);
  if (removesOwner) {
    const activeOwners = await prisma.user.count({
      where: { organizationId: auth.organizationId, role: "OWNER", isActive: true, NOT: { id: user.id } },
    });
    if (activeOwners === 0) throw new AppError(400, "В организации должен остаться хотя бы один активный владелец");
  }

  const data: Record<string, unknown> = {
    name: body.name,
    role: body.role,
    isActive: body.isActive,
  };
  if (body.password) {
    data.passwordHash = await hashPassword(body.password);
  }
  // A password reset, a role change or deactivation ends the user's sessions.
  if (body.password || body.isActive === false || (body.role && body.role !== user.role)) {
    data.tokenVersion = { increment: 1 };
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  const changes = Object.entries(body)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => (k === "password" ? "пароль" : k === "isActive" ? (body.isActive ? "включён" : "отключён") : k === "role" ? `роль → ${body.role}` : "имя"));
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "user", entityId: user.id, summary: `Пользователь ${user.email}: ${changes.join(", ")}` });
  return c.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role, isActive: updated.isActive });
});
