import { AMOCRM_CURRENT_FROM, AMOCRM_PLANS, AMOCRM_TERMS } from "./amocrm";
import { NOVA_WIDGETS } from "./nova";
import { WAZZUP_DISCOUNTS, WAZZUP_TARIFFS, type WazzupTariff } from "./wazzup";

/**
 * The built-in price lists of the vendors this integrator resells. The
 * system is single-tenant in practice, so the lists live in code: a price
 * change is a commit, and «Импортировать» in Продукты turns a list into
 * LicenseProduct rows (or updates the ones imported earlier).
 */
export interface CatalogItem {
  /** Stable id inside the vendor: "whatsapp:max", "widget:formuly_3_0". */
  key: string;
  name: string;
  /** Channel / section ("WhatsApp", "Платные виджеты"), used for grouping in the dialog. */
  group: string;
  /** Tariff code for the license_tariff dictionary: "max", "start", "widget", … */
  tariffCode: string;
  tariffName: string;
  /** paid — has prices; free — 0 ₽; usage — billed by consumption (AI tokens), imported at 0 ₽. */
  kind: "paid" | "free" | "usage";
  /** Price per term, in roubles, for each term the vendor sells. */
  prices: { months: number; price: number }[];
  /** Monthly price of one seat/channel when the vendor bills per unit; null = flat. */
  pricePerSeat: number | null;
  /** Human-readable inclusions, joined into the product description. */
  features: string[];
  /**
   * Ticked by default in the import dialog. False for rows that exist for
   * reference rather than for selling — an amoCRM price that is no longer
   * current, say.
   */
  recommended: boolean;
}

export interface CatalogVendor {
  code: string;
  name: string;
  /** Every term that appears in the items, ascending. */
  periods: number[];
  /** Term preselected in the import dialog. */
  defaultMonths: number;
  /**
   * Share of the price that goes to the vendor, prefilled in the import
   * dialog. Wazzup is always a 50/50 partner split; the others are the
   * plain default until their real split is confirmed.
   */
  vendorSharePercent: number;
  /** Operation category code (operation_category dictionary) to book income under, if present. */
  categoryCode: string;
  items: CatalogItem[];
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "_")
    .replace(/^_|_$/g, "");

// ---------------------------------------------------------------- Wazzup

function wazzupFeatures(t: WazzupTariff): string[] {
  const out: string[] = [];
  out.push(t.dialogs === null ? "безлимит диалогов" : `${t.dialogs} диалогов`);
  if (t.writeFirst !== undefined) out.push(t.writeFirst ? "можно писать первым" : "нельзя писать первым");
  if (t.groupChats !== undefined) out.push(t.groupChats ? "групповые чаты" : "без групповых чатов");
  out.push(t.audioTranscription ? "расшифровка аудио" : "без расшифровки аудио");
  return out;
}

/** Wazzup quotes a monthly price per channel; longer terms are that price minus a discount. */
function wazzupPrices(monthly: number): CatalogItem["prices"] {
  return [
    { months: 1, price: monthly },
    { months: 6, price: Math.round(monthly * 6 * (1 - WAZZUP_DISCOUNTS.halfYearPercent / 100)) },
    { months: 12, price: Math.round(monthly * 12 * (1 - WAZZUP_DISCOUNTS.yearPercent / 100)) },
  ];
}

const wazzup: CatalogVendor = {
  code: "wazzup",
  name: "Wazzup",
  periods: [1, 6, 12],
  defaultMonths: 1,
  vendorSharePercent: 50,
  categoryCode: "license_wazzup",
  items: WAZZUP_TARIFFS.map((t) => ({
    key: `${slug(t.channel)}:${t.plan.toLowerCase()}`,
    name: t.plan === "WABA" ? "Wazzup WABA" : `Wazzup ${t.channel} ${t.plan}`,
    group: t.channel,
    tariffCode: t.plan.toLowerCase(),
    tariffName: t.plan,
    kind: t.pricePerMonth === 0 ? "free" : "paid",
    prices: wazzupPrices(t.pricePerMonth),
    pricePerSeat: t.pricePerMonth,
    features: wazzupFeatures(t),
    recommended: t.pricePerMonth > 0,
  })),
};

// ------------------------------------------------------------------ NOVA

const novaGroup = { paid: "Платные виджеты", free: "Бесплатные виджеты", usage: "AI-виджеты (оплата по токенам)" } as const;

const nova: CatalogVendor = {
  code: "nova",
  name: "NOVA",
  periods: [6, 12, 24],
  defaultMonths: 12,
  vendorSharePercent: 50,
  categoryCode: "license_nova",
  items: NOVA_WIDGETS.map((w) => ({
    key: `widget:${slug(w.name)}`,
    name: `NOVA ${w.name}`,
    group: novaGroup[w.kind],
    tariffCode: "widget",
    tariffName: "Виджет",
    kind: w.kind,
    prices: w.prices
      ? [
          { months: 6, price: w.prices[6] },
          { months: 12, price: w.prices[12] },
          { months: 24, price: w.prices[24] },
        ]
      : [6, 12, 24].map((months) => ({ months, price: 0 })),
    pricePerSeat: null,
    features: [
      w.kind === "free" ? "бесплатный виджет" : w.kind === "usage" ? "оплата по токенам" : "виджет для amoCRM",
      ...(w.renewalForReview ? ["продление за отзыв"] : []),
    ],
    recommended: w.kind === "paid",
  })),
};

// ---------------------------------------------------------------- amoCRM

const ru = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

const amocrm: CatalogVendor = {
  code: "amocrm",
  name: "amoCRM",
  periods: AMOCRM_TERMS,
  defaultMonths: 12,
  vendorSharePercent: 50,
  categoryCode: "license_amocrm",
  items: AMOCRM_PLANS.map((p) => {
    const current = p.validFrom === AMOCRM_CURRENT_FROM;
    return {
      // The price is part of the identity: amoCRM reuses a tariff name at
      // several price points, and the owner names the deal by the price.
      key: `plan:${p.code}_${p.pricePerUserMonth}`,
      name: `amoCRM ${p.title} (${ru(p.pricePerUserMonth)})`,
      group: current ? `Действующие тарифы (с ${p.validFrom})` : `Прежние цены (до ${p.validTo ?? p.validFrom})`,
      tariffCode: p.code,
      tariffName: p.title,
      kind: "paid" as const,
      prices: AMOCRM_TERMS.map((months) => ({ months, price: p.pricePerUserMonth * months })),
      pricePerSeat: p.pricePerUserMonth,
      features: [
        `${ru(p.pricePerUserMonth)} ₽ за пользователя в месяц, без НДС`,
        ...(p.limits
          ? [
              `${ru(p.limits.contacts)} контактов/компаний, ${ru(p.limits.openDeals)} открытых сделок`,
              `${p.limits.storageMb} МБ для документов, ${p.limits.customFields} своих полей`,
            ]
          : []),
        p.validTo ? `цена действует с ${p.validFrom} до ${p.validTo}` : `цена действует с ${p.validFrom}`,
      ],
      recommended: current,
    };
  }),
};

export const VENDOR_CATALOG: CatalogVendor[] = [amocrm, wazzup, nova];

export function findVendor(code: string): CatalogVendor | undefined {
  return VENDOR_CATALOG.find((v) => v.code === code);
}

export interface PlannedProduct {
  catalogKey: string;
  name: string;
  tariffCode: string;
  tariffName: string;
  durationMonths: number;
  /** Price for the whole term (for one user/channel where the vendor bills per unit). */
  price: number;
  pricePerSeat: number | null;
  description: string;
}

/**
 * Expands the chosen catalog rows into the products to create: one per
 * item and term the vendor actually sells (a term the item has no price
 * for is skipped, so asking NOVA for "1 month" yields nothing).
 */
export function planProducts(vendor: CatalogVendor, keys: string[] | null, periods: number[]): PlannedProduct[] {
  const items = keys ? vendor.items.filter((i) => keys.includes(i.key)) : vendor.items;
  const out: PlannedProduct[] = [];
  for (const item of items) {
    for (const months of periods) {
      const term = item.prices.find((p) => p.months === months);
      if (!term) continue;
      out.push({
        catalogKey: `${vendor.code}:${item.key}:${months}`,
        name: months === 1 ? item.name : `${item.name}, ${months} мес.`,
        tariffCode: item.tariffCode,
        tariffName: item.tariffName,
        durationMonths: months,
        price: term.price,
        pricePerSeat: item.pricePerSeat,
        description: item.features.join(", "),
      });
    }
  }
  return out;
}
