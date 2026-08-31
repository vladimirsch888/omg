import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { asyncHandler, HttpError } from "../../utils/asyncHandler";

export const dictionariesRouter = Router();
dictionariesRouter.use(requireAuth);

// List all dictionary types (sections) with their values, for the current org.
dictionariesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const types = await prisma.dictionaryType.findMany({
      where: { organizationId: req.auth!.organizationId },
      include: { values: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    });
    res.json(types);
  })
);

const typeSchema = z.object({
  code: z.string().min(1).regex(/^[a-z0-9_]+$/, "Только латиница, цифры и подчёркивание"),
  name: z.string().min(1),
  description: z.string().optional(),
});

// Create a brand new reference-book section (fully user-defined).
dictionariesRouter.post(
  "/",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const body = typeSchema.parse(req.body);
    const existing = await prisma.dictionaryType.findUnique({
      where: { organizationId_code: { organizationId: req.auth!.organizationId, code: body.code } },
    });
    if (existing) throw new HttpError(409, "Раздел с таким кодом уже существует");
    const type = await prisma.dictionaryType.create({
      data: { ...body, organizationId: req.auth!.organizationId },
    });
    res.status(201).json(type);
  })
);

dictionariesRouter.delete(
  "/:id",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const type = await prisma.dictionaryType.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!type) throw new HttpError(404, "Раздел не найден");
    if (type.isSystem) throw new HttpError(400, "Системный раздел нельзя удалить");
    await prisma.dictionaryType.delete({ where: { id: type.id } });
    res.status(204).end();
  })
);

const valueSchema = z.object({
  code: z.string().min(1).regex(/^[a-z0-9_]+$/, "Только латиница, цифры и подчёркивание"),
  name: z.string().min(1),
  color: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

// Add a value to a section (e.g. a new operation category, project type, etc).
dictionariesRouter.post(
  "/:typeId/values",
  requireRole("OWNER", "ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const body = valueSchema.parse(req.body);
    const type = await prisma.dictionaryType.findFirst({
      where: { id: req.params.typeId, organizationId: req.auth!.organizationId },
    });
    if (!type) throw new HttpError(404, "Раздел не найден");

    const existing = await prisma.dictionaryValue.findUnique({
      where: { dictionaryTypeId_code: { dictionaryTypeId: type.id, code: body.code } },
    });
    if (existing) throw new HttpError(409, "Значение с таким кодом уже существует");

    const value = await prisma.dictionaryValue.create({
      data: { ...body, dictionaryTypeId: type.id, organizationId: req.auth!.organizationId },
    });
    res.status(201).json(value);
  })
);

const valueUpdateSchema = valueSchema.partial().extend({ isActive: z.boolean().optional() });

dictionariesRouter.patch(
  "/values/:id",
  requireRole("OWNER", "ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const body = valueUpdateSchema.parse(req.body);
    const value = await prisma.dictionaryValue.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!value) throw new HttpError(404, "Значение не найдено");
    const updated = await prisma.dictionaryValue.update({ where: { id: value.id }, data: body });
    res.json(updated);
  })
);

dictionariesRouter.delete(
  "/values/:id",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const value = await prisma.dictionaryValue.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!value) throw new HttpError(404, "Значение не найдено");
    await prisma.dictionaryValue.delete({ where: { id: value.id } });
    res.status(204).end();
  })
);
