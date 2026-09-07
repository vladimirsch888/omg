import { prisma } from "../../prisma";
import { AppError } from "../../utils/errors";
import { findVendor, planProducts } from "./catalog";

export interface ImportResult {
  created: number;
  updated: number;
  products: { id: string; name: string; action: "created" | "updated" }[];
}

/** Finds or creates a dictionary value by code; returns its id. */
async function ensureValue(organizationId: string, typeCode: string, typeName: string, code: string, name: string): Promise<string> {
  let type = await prisma.dictionaryType.findUnique({ where: { organizationId_code: { organizationId, code: typeCode } } });
  if (!type) type = await prisma.dictionaryType.create({ data: { organizationId, code: typeCode, name: typeName, isSystem: true } });
  const existing = await prisma.dictionaryValue.findFirst({ where: { organizationId, dictionaryTypeId: type.id, code } });
  if (existing) return existing.id;
  const count = await prisma.dictionaryValue.count({ where: { dictionaryTypeId: type.id } });
  const created = await prisma.dictionaryValue.create({ data: { organizationId, dictionaryTypeId: type.id, code, name, sortOrder: count } });
  return created.id;
}

/**
 * Turns a vendor's built-in price list into LicenseProduct rows. Re-running
 * updates the price, description, vendor and tariff of products imported
 * earlier (matched by catalogKey) and leaves their name and active flag
 * alone — those are the owner's to edit. The vendor share is left alone
 * too unless `updateVendorShare` says otherwise: it can be negotiated per
 * deal, so overwriting it silently would lose that.
 */
export async function importVendorCatalog(input: {
  organizationId: string;
  vendorCode: string;
  keys: string[] | null;
  periods: number[];
  vendorSharePercent: number;
  updateVendorShare?: boolean;
}): Promise<ImportResult> {
  const vendor = findVendor(input.vendorCode);
  if (!vendor) throw new AppError(404, "Вендор не найден в каталоге");
  const planned = planProducts(vendor, input.keys, input.periods);
  if (planned.length === 0) throw new AppError(400, "Не выбрано ни одного тарифа");

  const vendorValueId = await ensureValue(input.organizationId, "vendor", "Вендор", vendor.code, vendor.name);
  const tariffIds = new Map<string, string>();
  for (const p of planned) {
    if (!tariffIds.has(p.tariffCode)) {
      tariffIds.set(p.tariffCode, await ensureValue(input.organizationId, "license_tariff", "Тариф лицензии", p.tariffCode, p.tariffName));
    }
  }
  const category = await prisma.dictionaryValue.findFirst({
    where: { organizationId: input.organizationId, code: vendor.categoryCode, dictionaryType: { code: "operation_category" } },
    select: { id: true },
  });

  const result: ImportResult = { created: 0, updated: 0, products: [] };
  for (const p of planned) {
    const existing = await prisma.licenseProduct.findUnique({
      where: { organizationId_catalogKey: { organizationId: input.organizationId, catalogKey: p.catalogKey } },
      select: { id: true, name: true },
    });
    const shared = {
      vendorValueId,
      tariffValueId: tariffIds.get(p.tariffCode)!,
      pricePerSeat: p.pricePerSeat,
      defaultPrice: p.price,
      description: p.description,
    };
    if (existing) {
      await prisma.licenseProduct.update({
        where: { id: existing.id },
        data: input.updateVendorShare ? { ...shared, defaultVendorSharePercent: input.vendorSharePercent } : shared,
      });
      result.updated++;
      result.products.push({ id: existing.id, name: existing.name, action: "updated" });
    } else {
      const created = await prisma.licenseProduct.create({
        data: {
          organizationId: input.organizationId,
          catalogKey: p.catalogKey,
          name: p.name,
          type: "LICENSE",
          categoryValueId: category?.id ?? null,
          defaultDurationMonths: p.durationMonths,
          defaultVendorSharePercent: input.vendorSharePercent,
          defaultTaxable: true,
          ...shared,
        },
        select: { id: true, name: true },
      });
      result.created++;
      result.products.push({ id: created.id, name: created.name, action: "created" });
    }
  }
  return result;
}
