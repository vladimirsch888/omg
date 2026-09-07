import { WAZZUP_DISCOUNTS, WAZZUP_TARIFFS, type WazzupTariff } from "./wazzup";

/**
 * The built-in price lists of the vendors this integrator resells. The
 * system is single-tenant in practice, so the lists live in code: a price
 * change is a commit, and «Импортировать» in Продукты turns a list into
 * LicenseProduct rows (or updates the ones imported earlier).
 */
export interface CatalogItem {
  /** Stable id inside the vendor: "whatsapp:max". */
  key: string;
  name: string;
  /** Channel / product line ("WhatsApp"), used for grouping in the dialog. */
  group: string;
  /** Tariff code for the license_tariff dictionary: "max", "start", … */
  tariffCode: string;
  tariffName: string;
  pricePerMonth: number;
  /** Human-readable inclusions, joined into the product description. */
  features: string[];
}

export interface CatalogVendor {
  code: string;
  name: string;
  /** Percent off when the client pays for the whole period. */
  discounts: { months: number; percent: number }[];
  /** Operation category code (operation_category dictionary) to book income under, if present. */
  categoryCode: string;
  items: CatalogItem[];
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "_")
    .replace(/^_|_$/g, "");

function wazzupFeatures(t: WazzupTariff): string[] {
  const out: string[] = [];
  out.push(t.dialogs === null ? "безлимит диалогов" : `${t.dialogs} диалогов`);
  if (t.writeFirst !== undefined) out.push(t.writeFirst ? "можно писать первым" : "нельзя писать первым");
  if (t.groupChats !== undefined) out.push(t.groupChats ? "групповые чаты" : "без групповых чатов");
  out.push(t.audioTranscription ? "расшифровка аудио" : "без расшифровки аудио");
  return out;
}

const wazzup: CatalogVendor = {
  code: "wazzup",
  name: "Wazzup",
  discounts: [
    { months: 6, percent: WAZZUP_DISCOUNTS.halfYearPercent },
    { months: 12, percent: WAZZUP_DISCOUNTS.yearPercent },
  ],
  categoryCode: "license_wazzup",
  items: WAZZUP_TARIFFS.map((t) => ({
    key: `${slug(t.channel)}:${t.plan.toLowerCase()}`,
    name: t.plan === "WABA" ? "Wazzup WABA" : `Wazzup ${t.channel} ${t.plan}`,
    group: t.channel,
    tariffCode: t.plan.toLowerCase(),
    tariffName: t.plan,
    pricePerMonth: t.pricePerMonth,
    features: wazzupFeatures(t),
  })),
};

export const VENDOR_CATALOG: CatalogVendor[] = [wazzup];

export function findVendor(code: string): CatalogVendor | undefined {
  return VENDOR_CATALOG.find((v) => v.code === code);
}

export interface PlannedProduct {
  catalogKey: string;
  name: string;
  tariffCode: string;
  tariffName: string;
  durationMonths: number;
  /** Price for the whole period (per channel), after the period discount. */
  price: number;
  pricePerSeat: number;
  description: string;
}

/**
 * Expands the chosen catalog rows into the products to create: one per
 * item and period. A yearly product's price is 12 × monthly minus the
 * vendor's discount, rounded to the rouble.
 */
export function planProducts(vendor: CatalogVendor, keys: string[] | null, periods: number[]): PlannedProduct[] {
  const items = keys ? vendor.items.filter((i) => keys.includes(i.key)) : vendor.items;
  const out: PlannedProduct[] = [];
  for (const item of items) {
    for (const months of periods) {
      const discount = vendor.discounts.find((d) => d.months === months)?.percent ?? 0;
      const price = Math.round(item.pricePerMonth * months * (1 - discount / 100));
      out.push({
        catalogKey: `${vendor.code}:${item.key}:${months}`,
        name: months === 1 ? item.name : `${item.name}, ${months} мес.`,
        tariffCode: item.tariffCode,
        tariffName: item.tariffName,
        durationMonths: months,
        price,
        pricePerSeat: item.pricePerMonth,
        description: `${item.features.join(", ")}${discount ? `; оплата за ${months} мес. со скидкой ${discount} %` : ""}`,
      });
    }
  }
  return out;
}
