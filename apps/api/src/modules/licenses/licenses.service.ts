import { prisma } from "../../prisma";
import { startOfDay } from "../../utils/dates";

export interface LicenseRow {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  productId: string;
  productName: string;
  vendor: string | null;
  tariff: string | null;
  seats: number | null;
  price: number;
  pricePerSeat: number | null;
  /** Price per seat implied by this deal, when seats are known. */
  effectivePerSeat: number | null;
  durationMonths: number;
  monthlyValue: number;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  startDate: Date;
  nextBillingDate: Date;
  expiresAt: Date;
  daysLeft: number;
  invoiceSentAt: Date | null;
  accountRef: string | null;
  /** Why this row is an upsell candidate, if it is. */
  upsellHints: string[];
  /** Price on the deal disagrees with seats × catalog price per seat. */
  priceMismatch: boolean;
}

export interface LicensePortfolio {
  summary: {
    activeLicenses: number;
    totalSeats: number;
    monthlyRecurring: number;
    expiringThisMonth: number;
    expiringThisMonthValue: number;
    upsellCandidates: number;
    averagePerSeat: number | null;
  };
  byVendor: { vendor: string; licenses: number; seats: number; monthlyRecurring: number }[];
  byTariff: { tariff: string; licenses: number; seats: number }[];
  /** Next 6 months: how many licences (and how much money) expire. */
  expirations: { month: string; licenses: number; value: number; byVendor: Record<string, number> }[];
  rows: LicenseRow[];
}

/**
 * The licence portfolio: every subscription as a licence with its vendor,
 * tariff, seats and real expiry, plus the two things the owner acts on —
 * what expires soon and where more can be sold.
 */
export async function getLicensePortfolio(organizationId: string): Promise<LicensePortfolio> {
  const today = startOfDay(new Date());
  const subscriptions = await prisma.subscription.findMany({
    where: { organizationId },
    include: {
      client: { select: { id: true, name: true } },
      licenseProduct: {
        select: {
          id: true,
          name: true,
          pricePerSeat: true,
          vendorValue: { select: { name: true } },
          tariffValue: { select: { name: true, sortOrder: true } },
        },
      },
    },
    orderBy: [{ client: { name: "asc" } }, { nextBillingDate: "asc" }],
  });

  // The lowest tariff sortOrder per vendor marks the "minimum tariff" for upsell.
  const minTariffOrder = new Map<string, number>();
  for (const s of subscriptions) {
    const vendor = s.licenseProduct.vendorValue?.name ?? "";
    const order = s.licenseProduct.tariffValue?.sortOrder;
    if (order === undefined) continue;
    minTariffOrder.set(vendor, Math.min(minTariffOrder.get(vendor) ?? order, order));
  }

  const daysFrom = (d: Date) => Math.round((startOfDay(d).getTime() - today.getTime()) / 86_400_000);
  const rows: LicenseRow[] = subscriptions.map((s) => {
    const price = Number(s.price);
    const pricePerSeat = s.licenseProduct.pricePerSeat === null ? null : Number(s.licenseProduct.pricePerSeat);
    const expiresAt = s.expiresAt ?? s.nextBillingDate;
    const vendor = s.licenseProduct.vendorValue?.name ?? null;
    const tariffOrder = s.licenseProduct.tariffValue?.sortOrder;
    const hints: string[] = [];
    const monthsRunning = (today.getTime() - s.startDate.getTime()) / (30.4 * 86_400_000);
    if (s.status === "ACTIVE") {
      if (tariffOrder !== undefined && tariffOrder === minTariffOrder.get(vendor ?? "") && monthsRunning >= 12) {
        hints.push("минимальный тариф больше года");
      }
      if (s.seats !== null && s.seats <= 3 && monthsRunning >= 6) hints.push("мало мест при длительном использовании");
      if (s.durationMonths === 1 && monthsRunning >= 12) hints.push("платит помесячно больше года — предложить годовую");
    }
    const expectedPrice = pricePerSeat !== null && s.seats !== null ? pricePerSeat * s.seats : null;
    return {
      subscriptionId: s.id,
      clientId: s.client.id,
      clientName: s.client.name,
      productId: s.licenseProduct.id,
      productName: s.licenseProduct.name,
      vendor,
      tariff: s.licenseProduct.tariffValue?.name ?? null,
      seats: s.seats,
      price,
      pricePerSeat,
      effectivePerSeat: s.seats ? Math.round(price / s.seats) : null,
      durationMonths: s.durationMonths,
      monthlyValue: price / s.durationMonths,
      status: s.status,
      startDate: s.startDate,
      nextBillingDate: s.nextBillingDate,
      expiresAt,
      daysLeft: daysFrom(expiresAt),
      invoiceSentAt: s.invoiceSentAt,
      accountRef: s.accountRef,
      upsellHints: hints,
      priceMismatch: expectedPrice !== null && Math.abs(expectedPrice - price) > 1,
    };
  });

  const active = rows.filter((r) => r.status === "ACTIVE");
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = monthKey(today);

  const expirations: LicensePortfolio["expirations"] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const key = monthKey(d);
    const inMonth = active.filter((r) => monthKey(r.expiresAt) === key);
    const byVendor: Record<string, number> = {};
    for (const r of inMonth) byVendor[r.vendor ?? "—"] = (byVendor[r.vendor ?? "—"] ?? 0) + 1;
    expirations.push({ month: key, licenses: inMonth.length, value: inMonth.reduce((s, r) => s + r.price, 0), byVendor });
  }

  const group = <K extends string>(key: (r: LicenseRow) => K) => {
    const map = new Map<K, LicenseRow[]>();
    for (const r of active) {
      const k = key(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  };

  const seatsKnown = active.filter((r) => r.seats);
  const totalSeats = seatsKnown.reduce((s, r) => s + (r.seats ?? 0), 0);
  const expiringThisMonth = active.filter((r) => monthKey(r.expiresAt) === thisMonth);

  return {
    summary: {
      activeLicenses: active.length,
      totalSeats,
      monthlyRecurring: active.reduce((s, r) => s + r.monthlyValue, 0),
      expiringThisMonth: expiringThisMonth.length,
      expiringThisMonthValue: expiringThisMonth.reduce((s, r) => s + r.price, 0),
      upsellCandidates: active.filter((r) => r.upsellHints.length > 0).length,
      averagePerSeat: totalSeats > 0 ? Math.round(seatsKnown.reduce((s, r) => s + r.monthlyValue, 0) / totalSeats) : null,
    },
    byVendor: [...group((r) => r.vendor ?? "Без вендора")].map(([vendor, list]) => ({
      vendor,
      licenses: list.length,
      seats: list.reduce((s, r) => s + (r.seats ?? 0), 0),
      monthlyRecurring: list.reduce((s, r) => s + r.monthlyValue, 0),
    })),
    byTariff: [...group((r) => r.tariff ?? "Без тарифа")].map(([tariff, list]) => ({
      tariff,
      licenses: list.length,
      seats: list.reduce((s, r) => s + (r.seats ?? 0), 0),
    })),
    expirations,
    rows,
  };
}
