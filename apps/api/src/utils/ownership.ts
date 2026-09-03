import { prisma } from "../prisma";
import { AppError } from "./errors";

/**
 * Every id a client sends that points at another record must belong to the
 * caller's organization — otherwise a guessed UUID could attach one tenant's
 * project to another's client. These helpers turn that rule into one line at
 * each call site and answer a clean 404 instead of a foreign-key 500.
 */

export async function assertClient(organizationId: string, id: string) {
  const row = await prisma.client.findFirst({ where: { id, organizationId } });
  if (!row) throw new AppError(404, "Клиент не найден");
  return row;
}

export async function assertProject(organizationId: string, id: string) {
  const row = await prisma.project.findFirst({ where: { id, organizationId } });
  if (!row) throw new AppError(404, "Проект не найден");
  return row;
}

export async function assertRequest(organizationId: string, id: string, projectId?: string) {
  const row = await prisma.request.findFirst({
    where: { id, organizationId, ...(projectId ? { projectId } : {}) },
  });
  if (!row) throw new AppError(404, projectId ? "Заявка не найдена в этом проекте" : "Заявка не найдена");
  return row;
}

export async function assertLicenseProduct(organizationId: string, id: string) {
  const row = await prisma.licenseProduct.findFirst({ where: { id, organizationId } });
  if (!row) throw new AppError(404, "Продукт не найден");
  return row;
}

/**
 * A dictionary value of the given section, e.g. an operation category. The
 * section check matters too: a payment-method id must not be accepted where
 * a category is expected.
 */
export async function assertDictionaryValue(organizationId: string, id: string, typeCode: string, label: string) {
  const row = await prisma.dictionaryValue.findFirst({
    where: { id, organizationId, dictionaryType: { code: typeCode } },
  });
  if (!row) throw new AppError(404, `${label} не найдена в справочнике`);
  return row;
}

/**
 * The organization's category for vendor payouts. Found by its stable
 * systemKey rather than by code, so renaming the code in the admin panel
 * doesn't leave vendor expenses uncategorised.
 */
export async function findVendorCostCategoryId(organizationId: string): Promise<string | null> {
  const bySystemKey = await prisma.dictionaryValue.findFirst({
    where: { organizationId, systemKey: "vendor_cost" },
    select: { id: true },
  });
  if (bySystemKey) return bySystemKey.id;
  // Organizations seeded before systemKey existed: fall back to the seed code.
  const byCode = await prisma.dictionaryValue.findFirst({
    where: { organizationId, code: "license_cost", dictionaryType: { code: "operation_category" } },
    select: { id: true },
  });
  return byCode?.id ?? null;
}
