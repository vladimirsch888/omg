import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { config } from "../../config";
import { hashPassword, passwordSchema, verifyPassword } from "../../utils/password";
import { signToken } from "../../utils/jwt";
import { AppError } from "../../utils/errors";
import { rateLimit } from "../../utils/rateLimit";
import { requireAuth } from "../../middleware/auth.middleware";
import { seedDefaultDictionaries } from "../dictionaries/dictionaries.seed";
import { audit } from "../audit/audit.service";
import type { AppEnv } from "../../types/hono";

export const authRouter = new Hono<AppEnv>();

// Ten attempts per minute per IP for sign-in, five for sign-up.
const loginLimiter = rateLimit({ windowMs: 60_000, max: 10, message: "Слишком много попыток входа. Подождите минуту." });
const registerLimiter = rateLimit({ windowMs: 60_000, max: 5 });

async function registrationOpen(): Promise<boolean> {
  if (config.allowRegistration) return true;
  // First-run: with no organization at all, the owner must be able to sign up.
  return (await prisma.organization.count()) === 0;
}

/** Tells the login page whether to offer "Создать компанию". */
authRouter.get("/registration-status", async (c) => {
  return c.json({ open: await registrationOpen() });
});

const registerSchema = z.object({
  organizationName: z.string().trim().min(2),
  name: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
});

// Registers a brand new organization together with its first OWNER user.
authRouter.post("/register", registerLimiter, async (c) => {
  if (!(await registrationOpen())) {
    throw new AppError(403, "Регистрация закрыта. Попросите администратора создать вам пользователя.");
  }
  const body = registerSchema.parse(await c.req.json());

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    throw new AppError(409, "Пользователь с таким email уже существует");
  }

  const passwordHash = await hashPassword(body.password);

  // One transaction: an organization must never exist without its owner and
  // its default dictionaries (a crash halfway used to leave an empty org).
  const { organization, user } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: body.organizationName } });
    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        email: body.email,
        passwordHash,
        name: body.name,
        role: "OWNER",
      },
    });
    await seedDefaultDictionaries(organization.id, tx);
    return { organization, user };
  });

  const token = await signToken({
    userId: user.id,
    organizationId: organization.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  return c.json(
    {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      organization: { id: organization.id, name: organization.name },
    },
    201
  );
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

authRouter.post("/login", loginLimiter, async (c) => {
  const body = loginSchema.parse(await c.req.json());
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !user.isActive) {
    throw new AppError(401, "Неверный email или пароль");
  }
  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Неверный email или пароль");
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: user.organizationId },
  });

  const token = await signToken({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  audit({ organizationId: user.organizationId, userId: user.id, action: "login", entity: "user", entityId: user.id, summary: `Вход: ${user.email}` });

  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    organization: { id: organization.id, name: organization.name, currency: organization.currency },
  });
});

authRouter.get("/me", requireAuth, async (c) => {
  const auth = c.get("auth");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: user.organizationId },
  });
  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    organization: { id: organization.id, name: organization.name, currency: organization.currency },
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

/**
 * Self-service password change. Bumps tokenVersion, which invalidates every
 * other session of this user; the response carries a fresh token so the
 * current browser stays signed in.
 */
authRouter.post("/change-password", requireAuth, async (c) => {
  const auth = c.get("auth");
  const body = changePasswordSchema.parse(await c.req.json());
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
  const valid = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!valid) throw new AppError(400, "Текущий пароль указан неверно");
  if (body.currentPassword === body.newPassword) throw new AppError(400, "Новый пароль совпадает с текущим");

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword), tokenVersion: { increment: 1 } },
  });
  const token = await signToken({
    userId: updated.id,
    organizationId: updated.organizationId,
    role: updated.role,
    tokenVersion: updated.tokenVersion,
  });
  audit({ organizationId: user.organizationId, userId: user.id, action: "update", entity: "user", entityId: user.id, summary: "Смена собственного пароля" });
  return c.json({ token });
});

/** "Выйти на всех устройствах": every token issued so far stops working. */
authRouter.post("/logout-all", requireAuth, async (c) => {
  const auth = c.get("auth");
  await prisma.user.update({ where: { id: auth.userId }, data: { tokenVersion: { increment: 1 } } });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "user", entityId: auth.userId, summary: "Выход на всех устройствах" });
  return c.body(null, 204);
});
