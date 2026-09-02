import { prisma } from "../../prisma";
import { computeWaterfall } from "../finance/waterfall";

/**
 * Where a rouble of net profit came from. The split the client asked to see
 * next to the plan chart is licences vs works; "other" catches income that
 * belongs to neither (a manual operation not booked through a sale or a
 * subscription) so the percentages always add up to the real total instead of
 * quietly hiding money.
 */
export type ProfitKind = "license" | "work" | "other";

export interface SalesPlanMonth {
  month: number;
  plan: number | null;
  fact: number;
  netProfit: number;
}

export interface SalesPlanReport {
  year: number;
  annualPlan: number | null;
  /** Sum of the twelve monthly plans — shown when it disagrees with annualPlan. */
  monthlyPlanTotal: number;
  months: SalesPlanMonth[];
  totals: {
    fact: number;
    netProfit: number;
    /** Fact against the annual plan, or against the monthly total if no annual plan is set. */
    completionPercent: number | null;
  };
  profitMix: {
    license: number;
    work: number;
    other: number;
    total: number;
  };
}

export async function getSalesPlans(organizationId: string, year: number) {
  const plans = await prisma.salesPlan.findMany({
    where: { organizationId, year },
    orderBy: [{ month: "asc" }],
  });

  const annual = plans.find((p) => p.month === null);
  return {
    year,
    annual: annual ? Number(annual.amount) : null,
    months: plans
      .filter((p) => p.month !== null)
      .map((p) => ({ month: p.month as number, amount: Number(p.amount) })),
  };
}

interface PlanInput {
  /** null clears the plan for that period. */
  annual?: number | null;
  months?: { month: number; amount: number | null }[];
}

/**
 * Upserts a year's plans in one go — the UI edits the annual figure and all
 * twelve months on a single screen, so a single call keeps them consistent.
 *
 * (organizationId, year, month) uniqueness is enforced here rather than by a
 * unique index: Postgres treats NULLs as distinct, so an index would let two
 * annual plans exist for the same year.
 */
export async function saveSalesPlans(organizationId: string, year: number, input: PlanInput) {
  const entries: { month: number | null; amount: number | null }[] = [];
  if (input.annual !== undefined) entries.push({ month: null, amount: input.annual });
  for (const m of input.months ?? []) entries.push({ month: m.month, amount: m.amount });

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const existing = await tx.salesPlan.findFirst({
        where: { organizationId, year, month: entry.month },
      });

      if (entry.amount === null) {
        if (existing) await tx.salesPlan.delete({ where: { id: existing.id } });
        continue;
      }

      if (existing) {
        await tx.salesPlan.update({ where: { id: existing.id }, data: { amount: entry.amount } });
      } else {
        await tx.salesPlan.create({
          data: { organizationId, year, month: entry.month, amount: entry.amount },
        });
      }
    }
  });

  return getSalesPlans(organizationId, year);
}

/**
 * Plan vs fact for a year, plus the profit mix.
 *
 * "Fact" is accrued income (the same basis as PnL), so a sales target is
 * measured against the revenue the month earned, not against when the money
 * happened to land. "Net profit" everywhere here is the waterfall's
 * `spendable` — income minus the vendor's share minus the tax reserve — the
 * same definition the dashboard and the subscriptions page use.
 */
export async function getSalesPlanReport(organizationId: string, year: number): Promise<SalesPlanReport> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const [plans, operations, categoryKinds] = await Promise.all([
    prisma.salesPlan.findMany({ where: { organizationId, year } }),
    prisma.operation.findMany({
      where: {
        organizationId,
        type: "INCOME",
        accrualDate: { gte: yearStart, lt: yearEnd },
      },
      select: {
        amount: true,
        accrualDate: true,
        vendorSharePercent: true,
        taxable: true,
        categoryValueId: true,
        subscriptionId: true,
        sale: { select: { licenseProduct: { select: { type: true } } } },
      },
    }),
    getCategoryKinds(organizationId),
  ]);

  const annualPlan = plans.find((p) => p.month === null);
  const planByMonth = new Map<number, number>();
  for (const p of plans) {
    if (p.month !== null) planByMonth.set(p.month, Number(p.amount));
  }

  const months: SalesPlanMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    plan: planByMonth.get(i + 1) ?? null,
    fact: 0,
    netProfit: 0,
  }));

  const profitMix = { license: 0, work: 0, other: 0, total: 0 };
  let factTotal = 0;
  let netProfitTotal = 0;

  for (const op of operations) {
    const amount = Number(op.amount);
    const netProfit = computeWaterfall(amount, Number(op.vendorSharePercent), op.taxable).spendable;
    const monthIndex = op.accrualDate.getMonth();

    months[monthIndex].fact += amount;
    months[monthIndex].netProfit += netProfit;
    factTotal += amount;
    netProfitTotal += netProfit;

    profitMix[classifyIncome(op, categoryKinds)] += netProfit;
  }
  profitMix.total = profitMix.license + profitMix.work + profitMix.other;

  const monthlyPlanTotal = months.reduce((sum, m) => sum + (m.plan ?? 0), 0);
  const target = annualPlan ? Number(annualPlan.amount) : monthlyPlanTotal;

  return {
    year,
    annualPlan: annualPlan ? Number(annualPlan.amount) : null,
    monthlyPlanTotal,
    months,
    totals: {
      fact: factTotal,
      netProfit: netProfitTotal,
      completionPercent: target > 0 ? Math.round((factTotal / target) * 100) : null,
    },
    profitMix,
  };
}

/**
 * Which operation categories mean "licence" and which mean "work", derived
 * from the organisation's own catalog: a category used only by LICENSE
 * products is a licence category, one used only by WORK products is a work
 * category. Deriving it beats hardcoding dictionary codes — the codes are
 * user-editable, and a company that adds its own categories and products gets
 * the right answer without anyone touching this file. A category used by both
 * kinds is ambiguous and deliberately left unmapped.
 */
async function getCategoryKinds(organizationId: string): Promise<Map<string, ProfitKind>> {
  const products = await prisma.licenseProduct.findMany({
    where: { organizationId, categoryValueId: { not: null } },
    select: { categoryValueId: true, type: true },
  });

  const seen = new Map<string, Set<"LICENSE" | "WORK">>();
  for (const product of products) {
    const id = product.categoryValueId as string;
    if (!seen.has(id)) seen.set(id, new Set());
    seen.get(id)!.add(product.type);
  }

  const kinds = new Map<string, ProfitKind>();
  for (const [categoryId, types] of seen) {
    if (types.size !== 1) continue;
    kinds.set(categoryId, types.has("WORK") ? "work" : "license");
  }
  return kinds;
}

/**
 * Best available evidence, in descending order of certainty:
 *   1. booked from a subscription — always a licence;
 *   2. booked from a sale — the product's own type says which;
 *   3. a manual operation whose category the catalog maps to one kind;
 *   4. a manual operation with a vendor share — someone was paid a cut of it,
 *      which in this business only happens on a resold licence.
 * Anything left (miscellaneous income with no vendor and no telling category)
 * stays "other" rather than being forced into one of the two buckets, so the
 * percentages describe real money instead of a guess.
 */
function classifyIncome(
  op: {
    categoryValueId: string | null;
    vendorSharePercent: unknown;
    subscriptionId: string | null;
    sale: { licenseProduct: { type: "LICENSE" | "WORK" } } | null;
  },
  categoryKinds: Map<string, ProfitKind>
): ProfitKind {
  if (op.subscriptionId) return "license";
  if (op.sale) return op.sale.licenseProduct.type === "WORK" ? "work" : "license";

  const byCategory = op.categoryValueId ? categoryKinds.get(op.categoryValueId) : undefined;
  if (byCategory) return byCategory;

  return Number(op.vendorSharePercent) > 0 ? "license" : "other";
}
