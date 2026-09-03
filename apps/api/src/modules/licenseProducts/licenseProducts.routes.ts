import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireRole } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import { assertDictionaryValue } from "../../utils/ownership";
import { audit } from "../audit/audit.service";
import type { AppEnv } from "../../types/hono";

export const licenseProductsRouter = new Hono<AppEnv>();

licenseProductsRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const includeInactive = c.req.query("includeInactive") === "true";
  const products = await prisma.licenseProduct.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: { categoryValue: true },
    orderBy: { name: "asc" },
  });
  return c.json(products);
});

// defaultDurationMonths only means anything for a LICENSE (a subscription
// term to advance); a WORK product is a one-off job with no billing cycle,
// so it's always stored as null regardless of what's sent for it.
const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(["LICENSE", "WORK"]).default("LICENSE"),
  categoryValueId: z.string().uuid().optional().nullable(),
  defaultPrice: z.number().positive().max(1_000_000_000),
  defaultDurationMonths: z.number().int().positive().max(120).optional().nullable(),
  // Estimated execution time in working days — only meaningful for WORK.
  defaultWorkDays: z.number().int().positive().max(1000).optional().nullable(),
  defaultVendorSharePercent: z.number().min(0).max(100).default(50),
  defaultTaxable: z.boolean().default(true),
});

licenseProductsRouter.post("/", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const body = productSchema.parse(await c.req.json());
  if (body.categoryValueId) await assertDictionaryValue(auth.organizationId, body.categoryValueId, "operation_category", "Категория");
  const defaultDurationMonths = body.type === "WORK" ? null : (body.defaultDurationMonths ?? 1);
  const defaultWorkDays = body.type === "WORK" ? (body.defaultWorkDays ?? null) : null;
  const product = await prisma.licenseProduct.create({
    data: { ...body, organizationId: auth.organizationId, defaultDurationMonths, defaultWorkDays },
  });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "create", entity: "licenseProduct", entityId: product.id, summary: `Создан продукт «${product.name}»` });
  return c.json(product, 201);
});

licenseProductsRouter.patch("/:id", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const body = productSchema.partial().extend({ isActive: z.boolean().optional() }).parse(await c.req.json());
  const product = await prisma.licenseProduct.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!product) throw new AppError(404, "Продукт не найден");
  if (body.categoryValueId) await assertDictionaryValue(auth.organizationId, body.categoryValueId, "operation_category", "Категория");

  const effectiveType = body.type ?? product.type;
  const data = { ...body } as typeof body;
  if (effectiveType === "WORK") {
    data.defaultDurationMonths = null;
  } else if (body.defaultDurationMonths === undefined && product.defaultDurationMonths == null) {
    data.defaultDurationMonths = 1;
  }
  if (effectiveType === "LICENSE") {
    data.defaultWorkDays = null;
  }

  const updated = await prisma.licenseProduct.update({ where: { id: product.id }, data });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "licenseProduct", entityId: product.id, summary: `Изменён продукт «${updated.name}»${body.isActive !== undefined ? (body.isActive ? " — включён" : " — отключён") : ""}`, details: body });
  return c.json(updated);
});

licenseProductsRouter.delete("/:id", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const product = await prisma.licenseProduct.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!product) throw new AppError(404, "Продукт не найден");
  const [subscriptionCount, saleCount] = await Promise.all([
    prisma.subscription.count({ where: { licenseProductId: product.id } }),
    prisma.sale.count({ where: { licenseProductId: product.id } }),
  ]);
  if (subscriptionCount > 0 || saleCount > 0) {
    throw new AppError(409, "Нельзя удалить продукт: на него есть подписки или продажи. Деактивируйте его вместо удаления.");
  }
  await prisma.licenseProduct.delete({ where: { id: product.id } });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "delete", entity: "licenseProduct", entityId: product.id, summary: `Удалён продукт «${product.name}»` });
  return c.body(null, 204);
});
