import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { hashPassword, verifyPassword } from "../../utils/password";
import { signToken } from "../../utils/jwt";
import { asyncHandler, HttpError } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth.middleware";
import { seedDefaultDictionaries } from "../dictionaries/dictionaries.seed";

export const authRouter = Router();

const registerSchema = z.object({
  organizationName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

// Registers a brand new organization together with its first OWNER user.
authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new HttpError(409, "Пользователь с таким email уже существует");
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

    const token = signToken({
      userId: user.id,
      organizationId: organization.id,
      role: user.role,
    });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      organization: { id: organization.id, name: organization.name },
    });
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.isActive) {
      throw new HttpError(401, "Неверный email или пароль");
    }
    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      throw new HttpError(401, "Неверный email или пароль");
    }

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
    });

    const token = signToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      organization: { id: organization.id, name: organization.name, currency: organization.currency },
    });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
    });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      organization: { id: organization.id, name: organization.name, currency: organization.currency },
    });
  })
);
