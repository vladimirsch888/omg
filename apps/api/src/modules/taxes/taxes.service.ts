import { prisma } from "../../prisma";

export type TaxKind = "usn_advance" | "usn_annual" | "ip_fixed" | "ip_one_percent" | "vat_warning";

export interface TaxObligation {
  kind: TaxKind;
  /** "2026-Q1", "2026-H1", "2026-9M", "2026", "2026-fixed", "2026-1pct" */
  period: string;
  title: string;
  /** Deadline for the money. */
  dueDate: Date;
  /** Deadline for the ЕНП notification, when one is required. */
  noticeDate: Date | null;
  amount: number;
  paid: number;
  outstanding: number;
  status: "paid" | "overdue" | "due_soon" | "upcoming" | "info";
  breakdown: Record<string, number | string>;
}

export interface TaxCalendar {
  year: number;
  profile: TaxProfileView | null;
  obligations: TaxObligation[];
  totals: {
    dueThisQuarter: number;
    dueRestOfYear: number;
    paidThisYear: number;
    outstandingTotal: number;
    incomeYtd: number;
    effectiveRatePercent: number | null;
  };
  monthly: { month: string; income: number; taxAccrued: number; paid: number }[];
}

export interface TaxProfileView {
  form: string;
  regime: string;
  ratePercent: number;
  minimumTaxPercent: number;
  fixedContributions: number;
  onePercentThreshold: number;
  onePercentCap: number;
  deductFixedWhenDue: boolean;
  hasEmployees: boolean;
  vatThreshold: number | null;
}

export async function getTaxProfile(organizationId: string): Promise<TaxProfileView | null> {
  const p = await prisma.taxProfile.findUnique({ where: { organizationId } });
  if (!p) return null;
  return {
    form: p.form,
    regime: p.regime,
    ratePercent: Number(p.ratePercent),
    minimumTaxPercent: Number(p.minimumTaxPercent),
    fixedContributions: Number(p.fixedContributions),
    onePercentThreshold: Number(p.onePercentThreshold),
    onePercentCap: Number(p.onePercentCap),
    deductFixedWhenDue: p.deductFixedWhenDue,
    hasEmployees: p.hasEmployees,
    vatThreshold: p.vatThreshold === null ? null : Number(p.vatThreshold),
  };
}

const quarterEnds = [
  { period: "Q1", label: "I квартал", months: 3, dueMonth: 3, dueDay: 28 }, // 28 апреля
  { period: "H1", label: "полугодие", months: 6, dueMonth: 6, dueDay: 28 }, // 28 июля
  { period: "9M", label: "9 месяцев", months: 9, dueMonth: 9, dueDay: 28 }, // 28 октября
];

/**
 * The year's obligations for a sole proprietor on УСН, computed from the
 * profile and the cash-basis operations of the year:
 *
 *   advance(k) = base(k) × rate − deductible contributions − advances(1..k−1)
 *
 * where base is income (or income − expenses) paid up to the quarter's end,
 * and the deductible contributions are the fixed ones (the whole year's, as
 * soon as they are due — the post-2025 rule — or only what's paid) plus the
 * 1 % paid within the year. Every number is exposed in `breakdown` so the
 * page can show the arithmetic instead of a bare figure.
 */
export async function getTaxCalendar(organizationId: string, year: number): Promise<TaxCalendar> {
  const profile = await getTaxProfile(organizationId);
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const [ops, payments] = await Promise.all([
    prisma.operation.findMany({
      where: { organizationId, status: "ACTUAL", paymentDate: { gte: yearStart, lt: yearEnd }, taxPayment: false },
      select: { type: true, amount: true, paymentDate: true, taxable: true },
    }),
    prisma.operation.findMany({
      where: { organizationId, taxPayment: true, status: "ACTUAL", paymentDate: { not: null } },
      select: { amount: true, paymentDate: true, taxKind: true, taxPeriod: true },
    }),
  ]);
  return computeTaxCalendar({
    year,
    profile,
    ops: ops.map((o) => ({ type: o.type, amount: Number(o.amount), paymentDate: o.paymentDate!, taxable: o.taxable })),
    payments: payments.map((p) => ({ amount: Number(p.amount), paymentDate: p.paymentDate!, taxKind: p.taxKind, taxPeriod: p.taxPeriod })),
  });
}

export interface TaxOperationInput {
  type: "INCOME" | "EXPENSE";
  amount: number;
  paymentDate: Date;
  taxable: boolean;
}

export interface TaxPaymentInput {
  amount: number;
  paymentDate: Date;
  taxKind: string | null;
  taxPeriod: string | null;
}

/** The pure part of the calendar — everything above is just fetching its inputs. */
export function computeTaxCalendar({
  year,
  profile,
  ops,
  payments,
  today = new Date(),
}: {
  year: number;
  profile: TaxProfileView | null;
  ops: TaxOperationInput[];
  payments: TaxPaymentInput[];
  today?: Date;
}): TaxCalendar {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const incomeUpTo = (monthCount: number) =>
    ops
      .filter((o) => o.type === "INCOME" && o.taxable && o.paymentDate < new Date(year, monthCount, 1))
      .reduce((s, o) => s + o.amount, 0);
  const expenseUpTo = (monthCount: number) =>
    ops.filter((o) => o.type === "EXPENSE" && o.paymentDate < new Date(year, monthCount, 1)).reduce((s, o) => s + o.amount, 0);
  const paidFor = (kind: TaxKind, period: string) =>
    payments.filter((p) => p.taxKind === kind && p.taxPeriod === period).reduce((s, p) => s + p.amount, 0);
  const paidInYearOfKind = (kind: TaxKind, upTo: Date) =>
    payments
      .filter((p) => p.taxKind === kind && p.paymentDate >= yearStart && p.paymentDate < upTo)
      .reduce((s, p) => s + p.amount, 0);

  const incomeYtd = incomeUpTo(12);
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const mStart = new Date(year, i, 1);
    const mEnd = new Date(year, i + 1, 1);
    const income = ops.filter((o) => o.type === "INCOME" && o.taxable && o.paymentDate >= mStart && o.paymentDate < mEnd).reduce((s, o) => s + o.amount, 0);
    const paid = payments.filter((p) => p.paymentDate >= mStart && p.paymentDate < mEnd).reduce((s, p) => s + p.amount, 0);
    return { month: `${year}-${String(i + 1).padStart(2, "0")}`, income, taxAccrued: 0, paid };
  });

  const obligations: TaxObligation[] = [];
  const statusOf = (due: Date, amount: number, paid: number): TaxObligation["status"] => {
    if (amount <= 0 || paid >= amount - 1) return "paid";
    if (due < today) return "overdue";
    return (due.getTime() - today.getTime()) / 86_400_000 <= 14 ? "due_soon" : "upcoming";
  };

  if (profile) {
    const rate = profile.ratePercent / 100;
    const isIncomeExpense = profile.regime === "USN_INCOME_EXPENSE";

    // Fixed contributions (sole proprietor): due 28 December of the year.
    const fixedDue = new Date(year, 11, 28, 12);
    const fixedPaid = paidFor("ip_fixed", `${year}-fixed`);
    if (profile.form === "IP" && profile.fixedContributions > 0) {
      obligations.push({
        kind: "ip_fixed",
        period: `${year}-fixed`,
        title: `Фиксированные взносы ИП за ${year} год`,
        dueDate: fixedDue,
        noticeDate: null,
        amount: profile.fixedContributions,
        paid: fixedPaid,
        outstanding: Math.max(0, profile.fixedContributions - fixedPaid),
        status: statusOf(fixedDue, profile.fixedContributions, fixedPaid),
        breakdown: { "Сумма из настроек": profile.fixedContributions },
      });
    }

    // 1 % over the threshold: due 1 July of the NEXT year, counted on this year's income.
    if (profile.form === "IP") {
      const over = Math.max(0, incomeYtd - profile.onePercentThreshold);
      let onePercent = Math.round(over * 0.01);
      if (profile.onePercentCap > 0) onePercent = Math.min(onePercent, profile.onePercentCap);
      const due = new Date(year + 1, 6, 1, 12);
      const paid = paidFor("ip_one_percent", `${year}-1pct`);
      obligations.push({
        kind: "ip_one_percent",
        period: `${year}-1pct`,
        title: `1 % с дохода свыше ${formatMoney(profile.onePercentThreshold)} за ${year} год`,
        dueDate: due,
        noticeDate: null,
        amount: onePercent,
        paid,
        outstanding: Math.max(0, onePercent - paid),
        status: today < yearEnd && onePercent === 0 ? "info" : statusOf(due, onePercent, paid),
        breakdown: {
          "Доход с начала года": incomeYtd,
          "Порог": profile.onePercentThreshold,
          "Превышение": over,
          "1 %": onePercent,
          ...(profile.onePercentCap > 0 ? { "Максимум": profile.onePercentCap } : {}),
        },
      });
    }

    // Advances and the annual tax.
    let advancesSoFar = 0;
    const periods = [...quarterEnds, { period: "Y", label: "год", months: 12, dueMonth: 12, dueDay: 28 }];
    for (const q of periods) {
      const base = isIncomeExpense ? Math.max(0, incomeUpTo(q.months) - expenseUpTo(q.months)) : incomeUpTo(q.months);
      const periodEnd = new Date(year, q.months, 1);
      let tax = Math.round(base * rate);
      if (isIncomeExpense && q.period === "Y") {
        // Minimum tax: 1 % of income if it beats the computed tax.
        tax = Math.max(tax, Math.round(incomeUpTo(12) * (profile.minimumTaxPercent / 100)));
      }
      // Deductible contributions (only on the income regime — on
      // income−expense they are an expense already).
      let deduction = 0;
      if (!isIncomeExpense && profile.form === "IP") {
        const fixedPart = profile.deductFixedWhenDue ? profile.fixedContributions : Math.min(profile.fixedContributions, paidInYearOfKind("ip_fixed", periodEnd));
        const onePercentPart = paidInYearOfKind("ip_one_percent", periodEnd);
        deduction = fixedPart + onePercentPart;
        if (profile.hasEmployees) deduction = Math.min(deduction, tax / 2);
        deduction = Math.min(deduction, tax);
      }
      const amount = Math.max(0, tax - deduction - advancesSoFar);
      const isAnnual = q.period === "Y";
      const dueDate = isAnnual
        ? new Date(year + 1, profile.form === "IP" ? 3 : 2, 28, 12) // ИП: 28 апреля, ООО: 28 марта
        : new Date(year, q.dueMonth, q.dueDay, 12);
      // Noon, like every date the UI writes: a browser west of the server
      // would otherwise show the 27th for a deadline on the 28th.
      const noticeDate = isAnnual ? null : new Date(year, q.dueMonth, 25, 12);
      const periodKey = isAnnual ? `${year}` : `${year}-${q.period}`;
      const paid = paidFor(isAnnual ? "usn_annual" : "usn_advance", periodKey);
      obligations.push({
        kind: isAnnual ? "usn_annual" : "usn_advance",
        period: periodKey,
        title: isAnnual ? `Налог УСН за ${year} год` : `Аванс УСН за ${q.label} ${year}`,
        dueDate,
        noticeDate,
        amount,
        paid,
        outstanding: Math.max(0, amount - paid),
        // Paid early (e.g. contributions in the quarter they're for) wins
        // over "the period is still running".
        status: amount > 0 && paid >= amount - 1 ? "paid" : periodEnd > today ? "upcoming" : statusOf(dueDate, amount, paid),
        breakdown: {
          [isIncomeExpense ? "База (доходы − расходы)" : "Доходы нарастающим итогом"]: base,
          [`Ставка ${profile.ratePercent} %`]: tax,
          ...(deduction > 0 ? { "Вычет взносов": -deduction } : {}),
          ...(advancesSoFar > 0 ? { "Ранее начисленные авансы": -advancesSoFar } : {}),
          "К уплате": amount,
        },
      });
      advancesSoFar += amount;
      // Attribute the accrual to the last month of the period for the chart.
      monthly[Math.min(11, q.months - 1)].taxAccrued += amount;
    }

    if (profile.vatThreshold && profile.vatThreshold > 0) {
      const share = incomeYtd / profile.vatThreshold;
      if (share >= 0.8) {
        obligations.push({
          kind: "vat_warning",
          period: `${year}-vat`,
          title: share >= 1 ? "Порог НДС для УСН превышен" : "Доход приближается к порогу НДС для УСН",
          dueDate: yearEnd,
          noticeDate: null,
          amount: 0,
          paid: 0,
          outstanding: 0,
          status: "info",
          breakdown: { "Доход с начала года": incomeYtd, "Порог": profile.vatThreshold, "Заполнено, %": Math.round(share * 100) },
        });
      }
    }
  }

  obligations.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const quarterEnd = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + 3, 1);
  const paidThisYear = payments.filter((p) => p.paymentDate >= yearStart && p.paymentDate < yearEnd).reduce((s, p) => s + p.amount, 0);
  const money = obligations.filter((o) => o.kind !== "vat_warning");
  return {
    year,
    profile,
    obligations,
    totals: {
      dueThisQuarter: money.filter((o) => o.dueDate >= today && o.dueDate < quarterEnd).reduce((s, o) => s + o.outstanding, 0),
      dueRestOfYear: money.filter((o) => o.dueDate >= today && o.dueDate < new Date(today.getFullYear() + 1, 0, 1)).reduce((s, o) => s + o.outstanding, 0),
      paidThisYear,
      outstandingTotal: money.reduce((s, o) => s + o.outstanding, 0),
      incomeYtd,
      effectiveRatePercent: incomeYtd > 0 ? Math.round((money.reduce((s, o) => s + o.amount, 0) / incomeYtd) * 1000) / 10 : null,
    },
    monthly,
  };
}

/**
 * What the cash position should hold back for tax today: everything the
 * calendar says is still owed for the current and the previous year (the
 * previous year's annual tax and 1 % fall due in the current one).
 */
export async function getOutstandingTax(organizationId: string): Promise<number | null> {
  const profile = await prisma.taxProfile.findUnique({ where: { organizationId }, select: { id: true } });
  if (!profile) return null;
  const year = new Date().getFullYear();
  const [current, previous] = await Promise.all([getTaxCalendar(organizationId, year), getTaxCalendar(organizationId, year - 1)]);
  return current.totals.outstandingTotal + previous.totals.outstandingTotal;
}

/** Books a tax payment as an EXPENSE operation tied to an obligation. */
export async function recordTaxPayment(input: {
  organizationId: string;
  userId: string;
  kind: TaxKind;
  period: string;
  amount: number;
  date: Date;
  accountValueId: string | null;
  title: string;
}) {
  const category = await prisma.dictionaryValue.findFirst({
    where: { organizationId: input.organizationId, systemKey: "taxes" },
    select: { id: true },
  });
  return prisma.operation.create({
    data: {
      organizationId: input.organizationId,
      type: "EXPENSE",
      status: "ACTUAL",
      amount: input.amount,
      accrualDate: input.date,
      paymentDate: input.date,
      categoryValueId: category?.id ?? null,
      accountValueId: input.accountValueId,
      taxPayment: true,
      taxKind: input.kind,
      taxPeriod: input.period,
      counterparty: "ФНС",
      description: input.title,
      createdById: input.userId,
    },
  });
}

function formatMoney(n: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(n)} ₽`;
}
