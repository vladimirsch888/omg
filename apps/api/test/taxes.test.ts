import { describe, expect, it } from "vitest";
import { computeTaxCalendar, type TaxProfileView } from "../src/modules/taxes/taxes.service";

const ip: TaxProfileView = {
  form: "IP",
  regime: "USN_INCOME",
  ratePercent: 6,
  minimumTaxPercent: 1,
  fixedContributions: 57390,
  onePercentThreshold: 300_000,
  onePercentCap: 321_818,
  deductFixedWhenDue: true,
  hasEmployees: false,
  vatThreshold: null,
};

const income = (amount: number, month: number, day = 10) => ({
  type: "INCOME" as const,
  amount,
  paymentDate: new Date(2026, month - 1, day, 12),
  taxable: true,
});

const byPeriod = (calendar: ReturnType<typeof computeTaxCalendar>, period: string) =>
  calendar.obligations.find((o) => o.period === period)!;

describe("computeTaxCalendar — ИП на УСН «Доходы»", () => {
  const calendar = computeTaxCalendar({
    year: 2026,
    profile: ip,
    ops: [income(500_000, 2), income(500_000, 5)],
    payments: [],
    today: new Date(2026, 8, 7, 12),
  });

  it("nets the fixed contributions off the advances before anything is due", () => {
    // Q1: 500 000 × 6 % = 30 000 < 57 390 of contributions → nothing to pay.
    expect(byPeriod(calendar, "2026-Q1").amount).toBe(0);
    // H1: 1 000 000 × 6 % = 60 000 − 57 390 = 2 610.
    expect(byPeriod(calendar, "2026-H1").amount).toBe(2610);
    // 9M: no new income → the H1 advance already covers it.
    expect(byPeriod(calendar, "2026-9M").amount).toBe(0);
    expect(byPeriod(calendar, "2026").amount).toBe(0);
  });

  it("computes the 1 % over the threshold and dates it 1 July next year", () => {
    const one = byPeriod(calendar, "2026-1pct");
    expect(one.amount).toBe(7000);
    expect([one.dueDate.getFullYear(), one.dueDate.getMonth(), one.dueDate.getDate()]).toEqual([2027, 6, 1]);
  });

  it("puts every deadline at noon on the 28th so no time zone shows the 27th", () => {
    const h1 = byPeriod(calendar, "2026-H1");
    expect([h1.dueDate.getMonth(), h1.dueDate.getDate(), h1.dueDate.getHours()]).toEqual([6, 28, 12]);
    expect(h1.noticeDate?.getDate()).toBe(25);
    const fixed = byPeriod(calendar, "2026-fixed");
    expect([fixed.dueDate.getMonth(), fixed.dueDate.getDate()]).toEqual([11, 28]);
    expect(byPeriod(calendar, "2026").dueDate.getMonth()).toBe(3); // 28 апреля для ИП
  });

  it("marks statuses from today's point of view", () => {
    expect(byPeriod(calendar, "2026-H1").status).toBe("overdue"); // 28 July has passed, unpaid
    expect(byPeriod(calendar, "2026-9M").status).toBe("upcoming"); // period still running
    expect(byPeriod(calendar, "2026-fixed").status).toBe("upcoming");
    expect(calendar.totals.outstandingTotal).toBe(2610 + 57390 + 7000);
    expect(calendar.totals.dueRestOfYear).toBe(57390); // H1 is in the past, 1 % is next year
  });
});

describe("computeTaxCalendar — payments and edge cases", () => {
  it("matches a payment to its obligation by kind and period", () => {
    const calendar = computeTaxCalendar({
      year: 2026,
      profile: ip,
      ops: [income(500_000, 2), income(500_000, 5)],
      payments: [{ amount: 2610, paymentDate: new Date(2026, 6, 20, 12), taxKind: "usn_advance", taxPeriod: "2026-H1" }],
      today: new Date(2026, 8, 7, 12),
    });
    const h1 = byPeriod(calendar, "2026-H1");
    expect(h1.status).toBe("paid");
    expect(h1.outstanding).toBe(0);
    expect(calendar.totals.paidThisYear).toBe(2610);
  });

  it("treats contributions paid inside the running period as paid, not upcoming", () => {
    const calendar = computeTaxCalendar({
      year: 2026,
      profile: ip,
      ops: [],
      payments: [{ amount: 57390, paymentDate: new Date(2026, 2, 1, 12), taxKind: "ip_fixed", taxPeriod: "2026-fixed" }],
      today: new Date(2026, 8, 7, 12),
    });
    expect(byPeriod(calendar, "2026-fixed").status).toBe("paid");
  });

  it("flags a deadline within two weeks as due_soon", () => {
    const calendar = computeTaxCalendar({
      year: 2026,
      profile: ip,
      ops: [income(2_000_000, 2)],
      payments: [],
      today: new Date(2026, 3, 20, 12), // 8 days before 28 April
    });
    expect(byPeriod(calendar, "2026-Q1").status).toBe("due_soon");
    expect(byPeriod(calendar, "2026-Q1").amount).toBe(120_000 - 57390);
  });

  it("only deducts contributions actually paid when deductFixedWhenDue is off", () => {
    const calendar = computeTaxCalendar({
      year: 2026,
      profile: { ...ip, deductFixedWhenDue: false },
      ops: [income(1_000_000, 2)],
      payments: [{ amount: 10_000, paymentDate: new Date(2026, 1, 15, 12), taxKind: "ip_fixed", taxPeriod: "2026-fixed" }],
      today: new Date(2026, 8, 7, 12),
    });
    expect(byPeriod(calendar, "2026-Q1").amount).toBe(60_000 - 10_000);
  });

  it("caps the deduction at half the tax when there are employees", () => {
    const calendar = computeTaxCalendar({
      year: 2026,
      profile: { ...ip, hasEmployees: true },
      ops: [income(1_000_000, 2)],
      payments: [],
      today: new Date(2026, 8, 7, 12),
    });
    expect(byPeriod(calendar, "2026-Q1").amount).toBe(30_000);
  });

  it("caps the 1 % contribution", () => {
    const calendar = computeTaxCalendar({
      year: 2026,
      profile: ip,
      ops: [income(50_000_000, 2)],
      payments: [],
      today: new Date(2026, 8, 7, 12),
    });
    expect(byPeriod(calendar, "2026-1pct").amount).toBe(321_818);
  });

  it("warns at 80 % of the VAT threshold", () => {
    const calendar = computeTaxCalendar({
      year: 2026,
      profile: { ...ip, vatThreshold: 1_000_000 },
      ops: [income(850_000, 2)],
      payments: [],
      today: new Date(2026, 8, 7, 12),
    });
    const vat = calendar.obligations.find((o) => o.kind === "vat_warning");
    expect(vat?.status).toBe("info");
    expect(vat?.breakdown["Заполнено, %"]).toBe(85);
    expect(calendar.totals.outstandingTotal).not.toBeNaN();
  });

  it("applies the minimum tax on «Доходы − расходы» and the ООО deadline", () => {
    const calendar = computeTaxCalendar({
      year: 2026,
      profile: { ...ip, form: "OOO", regime: "USN_INCOME_EXPENSE", ratePercent: 15, fixedContributions: 0 },
      ops: [income(1_000_000, 2), { type: "EXPENSE", amount: 990_000, paymentDate: new Date(2026, 2, 1, 12), taxable: true }],
      payments: [],
      today: new Date(2027, 0, 15, 12),
    });
    // 15 % of 10 000 = 1 500 < 1 % of 1 000 000 = 10 000 → minimum tax; Q1 advance 1 500 already accrued.
    const annual = byPeriod(calendar, "2026");
    expect(annual.amount).toBe(10_000 - 1500);
    expect([annual.dueDate.getMonth(), annual.dueDate.getDate()]).toEqual([2, 28]); // 28 марта
    expect(calendar.obligations.some((o) => o.kind === "ip_fixed" || o.kind === "ip_one_percent")).toBe(false);
  });

  it("returns an empty calendar without a profile", () => {
    const calendar = computeTaxCalendar({ year: 2026, profile: null, ops: [income(100, 1)], payments: [] });
    expect(calendar.obligations).toEqual([]);
    expect(calendar.totals.incomeYtd).toBe(100);
  });
});
