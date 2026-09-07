import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireRole } from "../../middleware/auth.middleware";
import { audit } from "../audit/audit.service";
import { VENDOR_CATALOG, findVendor, planProducts } from "./catalog";
import { importVendorCatalog } from "./vendorCatalog.service";
import type { AppEnv } from "../../types/hono";

export const vendorCatalogRouter = new Hono<AppEnv>();

/** The built-in price lists plus, per row, whether it's already in Продукты. */
vendorCatalogRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const imported = await prisma.licenseProduct.findMany({
    where: { organizationId: auth.organizationId, catalogKey: { not: null } },
    select: { catalogKey: true, id: true, name: true, defaultPrice: true, isActive: true, defaultVendorSharePercent: true },
  });
  const byKey = new Map(imported.map((p) => [p.catalogKey!, p]));
  return c.json(
    VENDOR_CATALOG.map((v) => ({
      code: v.code,
      name: v.name,
      periods: v.periods,
      defaultMonths: v.defaultMonths,
      vendorSharePercent: v.vendorSharePercent,
      items: v.items.map((i) => ({
        ...i,
        imported: i.prices
          .map(({ months }) => {
            const p = byKey.get(`${v.code}:${i.key}:${months}`);
            return p
              ? {
                  months,
                  id: p.id,
                  name: p.name,
                  price: Number(p.defaultPrice),
                  isActive: p.isActive,
                  vendorSharePercent: Number(p.defaultVendorSharePercent),
                }
              : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null),
      })),
    }))
  );
});

const importSchema = z.object({
  vendor: z.string().min(1).max(40),
  /** Catalog keys to import; omitted = the whole list. */
  keys: z.array(z.string().min(1).max(80)).max(500).optional().nullable(),
  periods: z.array(z.number().int().min(1).max(120)).min(1).max(5).default([1]),
  vendorSharePercent: z.number().min(0).max(100).default(50),
  /** Also rewrite the share on products imported earlier (off by default: it may have been negotiated per deal). */
  updateVendorShare: z.boolean().default(false),
});

/** Preview without writing: what would be created or updated. */
vendorCatalogRouter.post("/preview", async (c) => {
  const body = importSchema.parse(await c.req.json());
  const vendor = findVendor(body.vendor);
  if (!vendor) return c.json({ error: "Вендор не найден в каталоге" }, 404);
  return c.json(planProducts(vendor, body.keys ?? null, body.periods));
});

vendorCatalogRouter.post("/import", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const body = importSchema.parse(await c.req.json());
  const result = await importVendorCatalog({
    organizationId: auth.organizationId,
    vendorCode: body.vendor,
    keys: body.keys ?? null,
    periods: body.periods,
    vendorSharePercent: body.vendorSharePercent,
    updateVendorShare: body.updateVendorShare,
  });
  audit({
    organizationId: auth.organizationId,
    userId: auth.userId,
    action: "create",
    entity: "licenseProduct",
    summary: `Импорт каталога ${findVendor(body.vendor)?.name ?? body.vendor}: создано ${result.created}, обновлено ${result.updated}`,
    details: { periods: body.periods, keys: body.keys ?? "all" },
  });
  return c.json(result);
});
