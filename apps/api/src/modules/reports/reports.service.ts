import { prisma } from "../../prisma";
import { config } from "../../config";
import { getProjectAndDescendantIds } from "../projects/projects.service";
import { computeWaterfall } from "../finance/waterfall";
import { endOfDay, startOfMonth } from "../../utils/dates";

export interface ReportFilters {
  from?: Date;
  to?: Date;
  projectId?: string;
  clientId?: string;
}

function accrualRange(filters: ReportFilters) {
  if (!filters.from && !filters.to) return {};
  return {
    accrualDate: {
      ...(filters.from ? { gte: filters.from } : {}),
      // "to" is a calendar day — the whole of it counts.
      ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
    },
  };
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Builds the Operation `where` fragment for a project or client scope, or
 * undefined for no scoping. A project filter matches only that project (and
 * its subprojects). A client filter must match an operation attributed to
 * the client via ANY path — its projects, its subscriptions, or its sales —
 * since project is optional on both subscriptions and sales and a
 * project-only filter would silently drop that revenue.
 */
async function resolveScopeWhere(
  organizationId: string,
  filters: ReportFilters
): Promise<Record<string, unknown> | undefined> {
  if (filters.projectId) {
    const projectIds = await getProjectAndDescendantIds(organizationId, filters.projectId);
    return { projectId: { in: projectIds } };
  }
  if (filters.clientId) {
    return {
      OR: [
        { project: { clientId: filters.clientId } },
        { subscription: { clientId: filters.clientId } },
        { sale: { clientId: filters.clientId } },
      ],
    };
  }
  return undefined;
}

/**
 * PnL (accrual method): revenue and costs recognised on the operation's
 * accrualDate, grouped by month and by category. Subprojects roll up into
 * their parent automatically when filtering by projectId.
 */
export async function getPnL(organizationId: string, filters: ReportFilters) {
  const scopeWhere = await resolveScopeWhere(organizationId, filters);

  const operations = await prisma.operation.findMany({
    where: {
      organizationId,
      ...(scopeWhere ?? {}),
      ...accrualRange(filters),
    },
    include: { categoryValue: true },
  });

  const periods = new Map<string, { period: string; income: number; expense: number }>();
  const categories = new Map<
    string,
    { categoryId: string; categoryName: string; income: number; expense: number }
  >();

  let totalIncome = 0;
  let totalExpense = 0;

  for (const op of operations) {
    const amount = Number(op.amount);
    const period = monthKey(op.accrualDate);
    if (!periods.has(period)) periods.set(period, { period, income: 0, expense: 0 });
    const bucket = periods.get(period)!;

    const catId = op.categoryValueId ?? "uncategorized";
    const catName = op.categoryValue?.name ?? "Без категории";
    if (!categories.has(catId)) {
      categories.set(catId, { categoryId: catId, categoryName: catName, income: 0, expense: 0 });
    }
    const catBucket = categories.get(catId)!;

    if (op.type === "INCOME") {
      bucket.income += amount;
      catBucket.income += amount;
      totalIncome += amount;
    } else {
      bucket.expense += amount;
      catBucket.expense += amount;
      totalExpense += amount;
    }
  }

  const periodsArr = [...periods.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((p) => ({ ...p, profit: p.income - p.expense }));

  return {
    periods: periodsArr,
    byCategory: [...categories.values()]
      .map((c) => ({ ...c, profit: c.income - c.expense }))
      .sort((a, b) => b.income + b.expense - (a.income + a.expense)),
    totals: {
      income: totalIncome,
      expense: totalExpense,
      profit: totalIncome - totalExpense,
    },
  };
}

/**
 * DDS / cash flow (cash method): only operations that actually moved money
 * (status ACTUAL and paymentDate set), grouped by month, with a running
 * cumulative balance.
 *
 * When the report is windowed with `from`, the running balance starts from
 * the money accumulated BEFORE the window (`openingBalance`) — otherwise a
 * "last 12 months" view would show a balance that ignores everything earned
 * earlier and disagree with the dashboard's all-time cash figure.
 */
export async function getDDS(organizationId: string, filters: ReportFilters) {
  const scopeWhere = await resolveScopeWhere(organizationId, filters);
  const cashWhere = { organizationId, status: "ACTUAL" as const, ...(scopeWhere ?? {}) };

  const [operations, openingAgg] = await Promise.all([
    prisma.operation.findMany({
      where: {
        ...cashWhere,
        paymentDate: {
          not: null,
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
        },
      },
    }),
    filters.from
      ? prisma.operation.groupBy({
          by: ["type"],
          where: { ...cashWhere, paymentDate: { not: null, lt: filters.from } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  let openingBalance = 0;
  for (const row of openingAgg) {
    const sum = Number(row._sum.amount ?? 0);
    openingBalance += row.type === "INCOME" ? sum : -sum;
  }

  const periods = new Map<string, { period: string; inflow: number; outflow: number }>();
  for (const op of operations) {
    const amount = Number(op.amount);
    const period = monthKey(op.paymentDate!);
    if (!periods.has(period)) periods.set(period, { period, inflow: 0, outflow: 0 });
    const bucket = periods.get(period)!;
    if (op.type === "INCOME") bucket.inflow += amount;
    else bucket.outflow += amount;
  }

  let balance = openingBalance;
  const periodsArr = [...periods.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((p) => {
      const net = p.inflow - p.outflow;
      balance += net;
      return { ...p, net, cumulativeBalance: balance };
    });

  const totals = periodsArr.reduce(
    (acc, p) => ({ inflow: acc.inflow + p.inflow, outflow: acc.outflow + p.outflow }),
    { inflow: 0, outflow: 0 }
  );

  return {
    periods: periodsArr,
    openingBalance,
    totals: { ...totals, net: totals.inflow - totals.outflow, endingBalance: balance },
  };
}

/**
 * Lifetime value for every client (or one client), based on net operations
 * to date. An operation counts toward a client if it's tied to one of that
 * client's projects OR (regardless of project) to one of their subscriptions
 * or sales — a subscription/sale created without a project (project is
 * optional on both) must still be attributed, or its revenue would be
 * invisible here even though the client is unambiguous.
 */
export async function getClientLTV(organizationId: string, clientId?: string) {
  const clients = await prisma.client.findMany({
    where: { organizationId, ...(clientId ? { id: clientId } : {}) },
    select: { id: true, name: true, status: true },
  });
  if (clients.length === 0) return [];

  const clientIds = clients.map((c) => c.id);
  const operations = await prisma.operation.findMany({
    where: {
      organizationId,
      OR: [
        { project: { clientId: { in: clientIds } } },
        { subscription: { clientId: { in: clientIds } } },
        { sale: { clientId: { in: clientIds } } },
      ],
    },
    select: {
      type: true,
      amount: true,
      accrualDate: true,
      project: { select: { clientId: true } },
      subscription: { select: { clientId: true } },
      sale: { select: { clientId: true } },
    },
  });

  const opsByClient = new Map<string, typeof operations>();
  for (const op of operations) {
    const attributedClientId = op.project?.clientId ?? op.subscription?.clientId ?? op.sale?.clientId;
    if (!attributedClientId) continue;
    if (!opsByClient.has(attributedClientId)) opsByClient.set(attributedClientId, []);
    opsByClient.get(attributedClientId)!.push(op);
  }

  const now = new Date();

  const results = clients.map((client) => {
    const clientOperations = opsByClient.get(client.id) ?? [];
    let income = 0;
    let expense = 0;
    let firstDate: Date | null = null;

    for (const op of clientOperations) {
      const amount = Number(op.amount);
      if (op.type === "INCOME") income += amount;
      else expense += amount;
      if (!firstDate || op.accrualDate < firstDate) firstDate = op.accrualDate;
    }

    const monthsActive = firstDate
      ? Math.max(
          1,
          (now.getFullYear() - firstDate.getFullYear()) * 12 + (now.getMonth() - firstDate.getMonth()) + 1
        )
      : 0;

    const netProfit = income - expense;

    return {
      clientId: client.id,
      clientName: client.name,
      status: client.status,
      totalIncome: income,
      totalExpense: expense,
      netProfit,
      firstOperationDate: firstDate,
      monthsActive,
      avgMonthlyRevenue: monthsActive > 0 ? income / monthsActive : 0,
      ltv: netProfit,
    };
  });

  return results.sort((a, b) => b.ltv - a.ltv);
}

/** High-level dashboard: current month PnL, 12-month trend, top clients, hours. */
export async function getCompanySummary(organizationId: string) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [currentMonthPnl, trendPnl, trendDds, ltv, hoursThisMonth] = await Promise.all([
    getPnL(organizationId, { from: monthStart }),
    getPnL(organizationId, { from: twelveMonthsAgo }),
    getDDS(organizationId, { from: twelveMonthsAgo }),
    getClientLTV(organizationId),
    prisma.timeEntry.aggregate({
      where: { organizationId, date: { gte: monthStart } },
      _sum: { hours: true },
    }),
  ]);

  return {
    currentMonth: currentMonthPnl.totals,
    // Lets the dashboard compare the running month fairly (pro-rated by day).
    monthProgress: { day: now.getDate(), daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() },
    pnlTrend: trendPnl.periods,
    ddsTrend: trendDds.periods,
    topClients: ltv.slice(0, 10),
    hoursThisMonth: Number(hoursThisMonth._sum.hours ?? 0),
  };
}

/**
 * "Сколько денег у меня реально есть": cash actually in hand (income minus
 * expenses on a cash basis, which already nets out vendor payouts recorded
 * as real EXPENSE operations) minus the tax reserve still owed — the reserve
 * accrued from taxable income LESS the tax actually paid (EXPENSE operations
 * flagged taxPayment). Without the subtraction a paid tax would count
 * against free cash twice: once as the outflow, once as the never-shrinking
 * reserve. See apps/api/src/modules/finance/waterfall.ts.
 */
export async function getCashPosition(organizationId: string) {
  const [dds, incomeOps, taxPaidAgg, byAccount, accounts] = await Promise.all([
    getDDS(organizationId, {}),
    prisma.operation.findMany({
      where: { organizationId, type: "INCOME", status: "ACTUAL", paymentDate: { not: null } },
      select: { amount: true, vendorSharePercent: true, taxable: true },
    }),
    prisma.operation.aggregate({
      where: { organizationId, type: "EXPENSE", status: "ACTUAL", paymentDate: { not: null }, taxPayment: true },
      _sum: { amount: true },
    }),
    prisma.operation.groupBy({
      by: ["accountValueId", "type"],
      where: { organizationId, status: "ACTUAL", paymentDate: { not: null } },
      _sum: { amount: true },
    }),
    prisma.dictionaryValue.findMany({
      where: { organizationId, dictionaryType: { code: "account" } },
      select: { id: true, name: true, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  let taxReserveAccrued = 0;
  for (const op of incomeOps) {
    const { taxReserve } = computeWaterfall(Number(op.amount), Number(op.vendorSharePercent), op.taxable);
    taxReserveAccrued += taxReserve;
  }
  const taxPaid = Number(taxPaidAgg._sum.amount ?? 0);
  const taxReserveOutstanding = Math.max(0, taxReserveAccrued - taxPaid);

  // Cash per account / cash box; operations with no account go to "unassigned".
  const balances = new Map<string | null, number>();
  for (const row of byAccount) {
    const sum = Number(row._sum.amount ?? 0);
    const key = row.accountValueId;
    balances.set(key, (balances.get(key) ?? 0) + (row.type === "INCOME" ? sum : -sum));
  }
  const accountBalances = [
    ...accounts.map((a) => ({ accountId: a.id, name: a.name, isActive: a.isActive, balance: balances.get(a.id) ?? 0 })),
    ...(balances.has(null) ? [{ accountId: null, name: "Без счёта", isActive: true, balance: balances.get(null) ?? 0 }] : []),
  ].filter((a) => a.balance !== 0 || a.isActive);

  const cumulativeCash = dds.totals.endingBalance;

  return {
    cumulativeCash,
    taxReserveAccrued,
    taxPaid,
    taxReserveOutstanding,
    spendable: cumulativeCash - taxReserveOutstanding,
    taxReservePercent: config.taxReservePercent,
    accountBalances,
  };
}
