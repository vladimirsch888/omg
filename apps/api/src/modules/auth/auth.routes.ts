import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { hashPassword, verifyPassword } from "../../utils/password";
import { signToken } from "../../utils/jwt";
import { AppError } from "../../utils/errors";
import { requireAuth } from "../../middleware/auth.middleware";
import { seedDefaultDictionaries } from "../dictionaries/dictionaries.seed";
import type { AppEnv } from "../../types/hono";

export const authRouter = new Hono<AppEnv>();

const registerSchema = z.object({
  organizationName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

// Registers a brand new organization together with its first OWNER user.
authRouter.post("/register", async (c) => {
  const body = registerSchema.parse(await c.req.json());

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    throw new AppError(409, "Пользователь с таким email уже существует");
  }

  const passwordHash = await hashPassword(body.password);

  const organization = await prisma.organization.create({
    data: { name: body.organizationName },
  });

  const user = await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: body.email,
      passwordHash,
      name: body.name,
      role: "OWNER",
    },
  });

  await seedDefaultDictionaries(organization.id);

  const token = await signToken({
    userId: user.id,
    organizationId: organization.id,
    role: user.role,
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
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (c) => {
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
  });

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
