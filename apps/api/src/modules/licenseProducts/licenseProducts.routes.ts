import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import type { AppEnv } from "../../types/hono";

export const licenseProductsRouter = new Hono<AppEnv>();
licenseProductsRouter.use(requireAuth);

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

const productSchema = z.object({
  name: z.string().min(1),
  categoryValueId: z.string().uuid().optional().nullable(),
  defaultPrice: z.number().positive(),
  defaultDurationMonths: z.number().int().positive().default(1),
  defaultVendorSharePercent: z.number().min(0).max(100).default(50),
  defaultTaxable: z.boolean().default(true),
});

licenseProductsRouter.post("/", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const body = productSchema.parse(await c.req.json());
  const product = await prisma.licenseProduct.create({
    data: { ...body, organizationId: auth.organizationId },
  });
  return c.json(product, 201);
});

licenseProductsRouter.patch("/:id", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const body = productSchema.partial().extend({ isActive: z.boolean().optional() }).parse(await c.req.json());
  const product = await prisma.licenseProduct.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!product) throw new AppError(404, "Продукт не найден");
  const updated = await prisma.licenseProduct.update({ where: { id: product.id }, data: body });
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
  return c.body(null, 204);
});
