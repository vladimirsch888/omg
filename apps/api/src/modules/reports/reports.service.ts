import { prisma } from "../../prisma";
import { config } from "../../config";
import { getProjectAndDescendantIds } from "../projects/projects.service";
import { computeWaterfall } from "../finance/waterfall";

export interface ReportFilters {
  from?: string;
  to?: string;
  projectId?: string;
  clientId?: string;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function resolveProjectIds(
  organizationId: string,
  filters: ReportFilters
): Promise<string[] | undefined> {
  if (filters.projectId) {
    return getProjectAndDescendantIds(organizationId, filters.projectId);
  }
  if (filters.clientId) {
    const projects = await prisma.project.findMany({
      where: { organizationId, clientId: filters.clientId },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }
  return undefined;
}

/**
 * PnL (accrual method): revenue and costs recognised on the operation's
 * accrualDate, grouped by month and by category. Subprojects roll up into
 * their parent automatically when filtering by projectId.
 */
export async function getPnL(organizationId: string, filters: ReportFilters) {
  const projectIds = await resolveProjectIds(organizationId, filters);

  const operations = await prisma.operation.findMany({
    where: {
      organizationId,
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
      ...(filters.from || filters.to
        ? {
            accrualDate: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
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
 */
export async function getDDS(organizationId: string, filters: ReportFilters) {
  const projectIds = await resolveProjectIds(organizationId, filters);

  const operations = await prisma.operation.findMany({
    where: {
      organizationId,
      status: "ACTUAL",
      paymentDate: { not: null },
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
      ...(filters.from || filters.to
        ? {
            paymentDate: {
              not: null,
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    },
  });

  const periods = new Map<string, { period: string; inflow: number; outflow: number }>();
  for (const op of operations) {
    const amount = Number(op.amount);
    const period = monthKey(op.paymentDate!);
    if (!periods.has(period)) periods.set(period, { period, inflow: 0, outflow: 0 });
    const bucket = periods.get(period)!;
    if (op.type === "INCOME") bucket.inflow += amount;
    else bucket.outflow += amount;
  }

  let balance = 0;
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
    totals: { ...totals, net: totals.inflow - totals.outflow, endingBalance: balance },
  };
}

/** Lifetime value for every client (or one client), based on net operations to date. */
export async function getClientLTV(organizationId: string, clientId?: string) {
  const clients = await prisma.client.findMany({
    where: { organizationId, ...(clientId ? { id: clientId } : {}) },
    include: {
      projects: {
        select: {
          id: true,
          operations: { select: { type: true, amount: true, accrualDate: true } },
        },
      },
    },
  });

  const now = new Date();

  const results = clients.map((client) => {
    const operations = client.projects.flatMap((p) => p.operations);
    let income = 0;
    let expense = 0;
    let firstDate: Date | null = null;

    for (const op of operations) {
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
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [currentMonthPnl, trendPnl, trendDds, ltv, hoursThisMonth] = await Promise.all([
    getPnL(organizationId, { from: startOfMonth.toISOString() }),
    getPnL(organizationId, { from: twelveMonthsAgo.toISOString() }),
    getDDS(organizationId, { from: twelveMonthsAgo.toISOString() }),
    getClientLTV(organizationId),
    prisma.timeEntry.aggregate({
      where: { organizationId, date: { gte: startOfMonth } },
      _sum: { hours: true },
    }),
  ]);

  return {
    currentMonth: currentMonthPnl.totals,
    pnlTrend: trendPnl.periods,
    ddsTrend: trendDds.periods,
    topClients: ltv.slice(0, 10),
    hoursThisMonth: Number(hoursThisMonth._sum.hours ?? 0),
  };
}

/**
 * "Сколько денег у меня реально есть": cash actually in hand (income minus
 * expenses on a cash basis, which already nets out vendor payouts recorded
 * as real EXPENSE operations) minus the tax reserve accrued from taxable
 * income — see apps/api/src/modules/finance/waterfall.ts.
 */
export async function getCashPosition(organizationId: string) {
  const [dds, incomeOps] = await Promise.all([
    getDDS(organizationId, {}),
    prisma.operation.findMany({
      where: { organizationId, type: "INCOME", status: "ACTUAL", paymentDate: { not: null } },
      select: { amount: true, vendorSharePercent: true, taxable: true },
    }),
  ]);

  let taxReserveAccrued = 0;
  for (const op of incomeOps) {
    const { taxReserve } = computeWaterfall(Number(op.amount), Number(op.vendorSharePercent), op.taxable);
    taxReserveAccrued += taxReserve;
  }

  const cumulativeCash = dds.totals.endingBalance;

  return {
    cumulativeCash,
    taxReserveAccrued,
    spendable: cumulativeCash - taxReserveAccrued,
    taxReservePercent: config.taxReservePercent,
  };
}
