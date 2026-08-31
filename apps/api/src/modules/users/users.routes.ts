import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { asyncHandler, HttpError } from "../../utils/asyncHandler";
import { hashPassword } from "../../utils/password";

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { organizationId: req.auth!.organizationId },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    res.json(users);
  })
);

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "VIEWER"]).default("MANAGER"),
});

usersRouter.post(
  "/",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new HttpError(409, "Пользователь с таким email уже существует");

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        organizationId: req.auth!.organizationId,
        email: body.email,
        passwordHash,
        name: body.name,
        role: body.role,
      },
    });
    res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
  })
);

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

usersRouter.patch(
  "/:id",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!user) throw new HttpError(404, "Пользователь не найден");

    const data: Record<string, unknown> = {
      name: body.name,
      role: body.role,
      isActive: body.isActive,
    };
    if (body.password) {
      data.passwordHash = await hashPassword(body.password);
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data });
    res.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role, isActive: updated.isActive });
  })
);
