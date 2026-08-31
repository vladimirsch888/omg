import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import type { AppEnv } from "../../types/hono";

export const dictionariesRouter = new Hono<AppEnv>();
dictionariesRouter.use(requireAuth);

// List all dictionary types (sections) with their values, for the current org.
dictionariesRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const types = await prisma.dictionaryType.findMany({
    where: { organizationId: auth.organizationId },
    include: { values: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });
  return c.json(types);
});

const typeSchema = z.object({
  code: z.string().min(1).regex(/^[a-z0-9_]+$/, "Только латиница, цифры и подчёркивание"),
  name: z.string().min(1),
  description: z.string().optional(),
});

// Create a brand new reference-book section (fully user-defined).
dictionariesRouter.post("/", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const body = typeSchema.parse(await c.req.json());
  const existing = await prisma.dictionaryType.findUnique({
    where: { organizationId_code: { organizationId: auth.organizationId, code: body.code } },
  });
  if (existing) throw new AppError(409, "Раздел с таким кодом уже существует");
  const type = await prisma.dictionaryType.create({
    data: { ...body, organizationId: auth.organizationId },
  });
  return c.json(type, 201);
});

dictionariesRouter.delete("/:id", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const type = await prisma.dictionaryType.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!type) throw new AppError(404, "Раздел не найден");
  if (type.isSystem) throw new AppError(400, "Системный раздел нельзя удалить");
  await prisma.dictionaryType.delete({ where: { id: type.id } });
  return c.body(null, 204);
});

const valueSchema = z.object({
  code: z.string().min(1).regex(/^[a-z0-9_]+$/, "Только латиница, цифры и подчёркивание"),
  name: z.string().min(1),
  color: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

// Add a value to a section (e.g. a new operation category, project type, etc).
dictionariesRouter.post("/:typeId/values", requireRole("OWNER", "ADMIN", "MANAGER"), async (c) => {
  const auth = c.get("auth");
  const body = valueSchema.parse(await c.req.json());
  const type = await prisma.dictionaryType.findFirst({
    where: { id: c.req.param("typeId"), organizationId: auth.organizationId },
  });
  if (!type) throw new AppError(404, "Раздел не найден");

  const existing = await prisma.dictionaryValue.findUnique({
    where: { dictionaryTypeId_code: { dictionaryTypeId: type.id, code: body.code } },
  });
  if (existing) throw new AppError(409, "Значение с таким кодом уже существует");

  const value = await prisma.dictionaryValue.create({
    data: { ...body, dictionaryTypeId: type.id, organizationId: auth.organizationId },
  });
  return c.json(value, 201);
});

const valueUpdateSchema = valueSchema.partial().extend({ isActive: z.boolean().optional() });

dictionariesRouter.patch("/values/:id", requireRole("OWNER", "ADMIN", "MANAGER"), async (c) => {
  const auth = c.get("auth");
  const body = valueUpdateSchema.parse(await c.req.json());
  const value = await prisma.dictionaryValue.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!value) throw new AppError(404, "Значение не найдено");
  const updated = await prisma.dictionaryValue.update({ where: { id: value.id }, data: body });
  return c.json(updated);
});

dictionariesRouter.delete("/values/:id", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const value = await prisma.dictionaryValue.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!value) throw new AppError(404, "Значение не найдено");
  await prisma.dictionaryValue.delete({ where: { id: value.id } });
  return c.body(null, 204);
});
