import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import { recordSale } from "./sales.service";
import type { AppEnv } from "../../types/hono";

export const salesRouter = new Hono<AppEnv>();
salesRouter.use(requireAuth);

salesRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const clientId = c.req.query("clientId");
  const sales = await prisma.sale.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(clientId ? { clientId } : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      licenseProduct: { select: { id: true, name: true } },
    },
    orderBy: { saleDate: "desc" },
  });
  return c.json(sales);
});

salesRouter.get("/:id", async (c) => {
  const auth = c.get("auth");
  const sale = await prisma.sale.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
    include: {
      client: true,
      project: { select: { id: true, name: true } },
      licenseProduct: true,
      operations: { orderBy: { accrualDate: "desc" } },
    },
  });
  if (!sale) throw new AppError(404, "Продажа не найдена");
  return c.json(sale);
});

const createSchema = z.object({
  clientId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  licenseProductId: z.string().uuid(),
  amount: z.number().positive(),
  saleDate: z.string().datetime().optional(),
});

salesRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = createSchema.parse(await c.req.json());
  const organizationId = auth.organizationId;

  const [client, product] = await Promise.all([
    prisma.client.findFirst({ where: { id: body.clientId, organizationId } }),
    prisma.licenseProduct.findFirst({ where: { id: body.licenseProductId, organizationId } }),
  ]);
  if (!client) throw new AppError(404, "Клиент не найден");
  if (!product) throw new AppError(404, "Продукт не найден");

  if (body.projectId) {
    const project = await prisma.project.findFirst({ where: { id: body.projectId, organizationId } });
    if (!project) throw new AppError(404, "Проект не найден");
    if (project.clientId !== body.clientId) {
      throw new AppError(400, "Проект принадлежит другому клиенту");
    }
  }

  const saleDate = body.saleDate ? new Date(body.saleDate) : new Date();

  const result = await recordSale({
    organizationId,
    clientId: body.clientId,
    projectId: body.projectId ?? null,
    licenseProductId: body.licenseProductId,
    amount: body.amount,
    saleDate,
    vendorSharePercent: Number(product.defaultVendorSharePercent),
    taxable: product.defaultTaxable,
    categoryValueId: product.categoryValueId,
    clientName: client.name,
    productName: product.name,
    userId: auth.userId,
  });

  return c.json(result, 201);
});

salesRouter.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const sale = await prisma.sale.findFirst({
    where: { id: c.req.param("id"), organizationId: auth.organizationId },
  });
  if (!sale) throw new AppError(404, "Продажа не найдена");
  await prisma.sale.delete({ where: { id: sale.id } });
  return c.body(null, 204);
});
