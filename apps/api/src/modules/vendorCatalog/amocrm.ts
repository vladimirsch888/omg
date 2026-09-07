/**
 * amoCRM price list (amocrm.ru, September 2026), transcribed from the
 * public tariff table. Per the owner's decision the list carries only the
 * per-user plans actually resold — Enterprise, Микро-Бизнес and Старт-ап
 * are left out. `pricePerUserMonth` is the price of one user for one
 * month, without VAT; amoCRM sells these plans by half-year, year and two
 * years, so the product price is that rate times the term.
 */
export interface AmoCrmPlan {
  /** Tariff code for the license_tariff dictionary. */
  code: string;
  /** Tariff name without the price — the price is appended for the product name. */
  title: string;
  pricePerUserMonth: number;
  /** Limits, where the price page states them; omitted for the 2026 line-up. */
  limits?: {
    contacts: number;
    openDeals: number;
    storageMb: number;
    customFields: number;
  };
  /** Validity window of this price; validTo null = still on sale. */
  validFrom: string;
  validTo: string | null;
}

/** Newest prices first: the current line-up, then the archive. */
export const AMOCRM_PLANS: AmoCrmPlan[] = [
  { code: "basic", title: "Базовый", pricePerUserMonth: 599, validFrom: "01.09.2026", validTo: null },
  { code: "advanced", title: "Расширенный", pricePerUserMonth: 1299, validFrom: "01.09.2026", validTo: null },
  { code: "professional", title: "Профессиональный", pricePerUserMonth: 1799, validFrom: "01.09.2026", validTo: null },
  {
    code: "advanced",
    title: "Расширенный",
    pricePerUserMonth: 1099,
    limits: { contacts: 10_000, openDeals: 1000, storageMb: 200, customFields: 200 },
    validFrom: "01.09.2024",
    validTo: "01.09.2025",
  },
  {
    code: "professional",
    title: "Профессиональный",
    pricePerUserMonth: 1599,
    limits: { contacts: 20_000, openDeals: 3000, storageMb: 400, customFields: 400 },
    validFrom: "01.09.2024",
    validTo: "01.09.2025",
  },
  {
    code: "basic",
    title: "Базовый",
    pricePerUserMonth: 499,
    limits: { contacts: 5000, openDeals: 500, storageMb: 100, customFields: 100 },
    validFrom: "01.06.2021",
    validTo: "01.09.2024",
  },
  {
    code: "advanced",
    title: "Расширенный",
    pricePerUserMonth: 999,
    limits: { contacts: 10_000, openDeals: 1000, storageMb: 200, customFields: 200 },
    validFrom: "01.06.2021",
    validTo: "01.09.2024",
  },
  {
    code: "professional",
    title: "Профессиональный",
    pricePerUserMonth: 1499,
    limits: { contacts: 20_000, openDeals: 3000, storageMb: 400, customFields: 400 },
    validFrom: "01.06.2021",
    validTo: "01.09.2024",
  },
];

/** The line-up currently on sale — the rest of the table is history. */
export const AMOCRM_CURRENT_FROM = "01.09.2026";

/** amoCRM sells these plans by half-year, year and two years. */
export const AMOCRM_TERMS = [6, 12, 24];
