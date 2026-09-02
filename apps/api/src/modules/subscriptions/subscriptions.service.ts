import { prisma } from "../../prisma";
import { computeWaterfall } from "../finance/waterfall";

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

async function getLicenseCostCategoryId(organizationId: string): Promise<string | null> {
  const value = await prisma.dictionaryValue.findFirst({
    where: { organizationId, code: "license_cost", dictionaryType: { code: "operation_category" } },
  });
  return value?.id ?? null;
}

interface SubscriptionForBilling {
  id: string;
  organizationId: string;
  clientId: string;
  projectId: string | null;
  price: unknown; // Prisma.Decimal
  durationMonths: number;
  vendorSharePercent: unknown; // Prisma.Decimal
  taxable: boolean;
  isDemo: boolean;
  licenseProduct: { name: string; categoryValueId: string | null };
  client: { name: string };
}

/**
 * Creates the income operation for one billing period of a subscription
 * (plus the linked vendor-cost expense operation, if a vendor share
 * applies), then advances the subscription's nextBillingDate. Used both
 * when a subscription is first created and by the "Продлить" (renew)
 * action — the one thing the client asked to be a single button.
 *
 * `priceOverride`, when given, bills this period at that amount instead of
 * the subscription's stored price, and persists it as the subscription's
 * new price — so a price change made while renewing (e.g. the client's
 * plan just got more expensive) sticks for the next renewal too, not just
 * this one.
 */
export async function billSubscription(
  subscription: SubscriptionForBilling,
  billingDate: Date,
  userId: string,
  priceOverride?: number
) {
  const price = priceOverride ?? Number(subscription.price);
  const vendorSharePercent = Number(subscription.vendorSharePercent);

  const incomeOperation = await prisma.operation.create({
    data: {
      organizationId: subscription.organizationId,
      isDemo: subscription.isDemo,
      projectId: subscription.projectId,
      subscriptionId: subscription.id,
      type: "INCOME",
      status: "ACTUAL",
      amount: price,
      accrualDate: billingDate,
      paymentDate: billingDate,
      categoryValueId: subscription.licenseProduct.categoryValueId,
      vendorSharePercent,
      taxable: subscription.taxable,
      counterparty: subscription.client.name,
      description: `Оплата лицензии: ${subscription.licenseProduct.name} (${subscription.durationMonths} мес.)`,
      createdById: userId,
    },
  });

  let expenseOperation = null;
  if (vendorSharePercent > 0) {
    const categoryValueId = await getLicenseCostCategoryId(subscription.organizationId);
    const vendorCost = Math.round((price * vendorSharePercent) / 100);
    expenseOperation = await prisma.operation.create({
      data: {
        organizationId: subscription.organizationId,
        isDemo: subscription.isDemo,
        projectId: subscription.projectId,
        subscriptionId: subscription.id,
        type: "EXPENSE",
        status: "ACTUAL",
        amount: vendorCost,
        accrualDate: billingDate,
        paymentDate: billingDate,
        categoryValueId,
        counterparty: "Вендор",
        description: `Оплата вендору за лицензию: ${subscription.licenseProduct.name}`,
        createdById: userId,
      },
    });
  }

  const updatedSubscription = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      nextBillingDate: addMonths(billingDate, subscription.durationMonths),
      ...(priceOverride !== undefined ? { price: priceOverride } : {}),
    },
  });

  return { incomeOperation, expenseOperation, subscription: updatedSubscription };
}

/**
 * "Подписки на лицензии" month overview: how much of this month's expected
 * subscription revenue has already been renewed, its net profit so far, and
 * what's still projected to come in from subscriptions not yet renewed this
 * month (an ACTIVE subscription whose nextBillingDate falls on/before the
 * end of this month — including anything overdue from a missed renewal —
 * counts as still expected). A subscription can't appear in both buckets:
 * renewing always pushes nextBillingDate at least one month out, so once
 * billed this month it drops out of "pending" on its own.
 *
 * "Net profit" here is the waterfall's `spendable` (see
 * apps/api/src/modules/finance/waterfall.ts): the incoming amount minus
 * BOTH the vendor's cut (vendorSharePercent) AND the tax reserve
 * (TAX_RESERVE_PERCENT, skipped only when taxable=false, e.g. an untaxed
 * direct "card" payment) — not just the vendor cut.
 */
export async function getMonthSummary(organizationId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [billedThisMonth, pendingSubscriptions] = await Promise.all([
    prisma.operation.findMany({
      where: {
        organizationId,
        subscriptionId: { not: null },
        type: "INCOME",
        accrualDate: { gte: monthStart, lt: monthEnd },
      },
      select: { amount: true, vendorSharePercent: true, taxable: true },
    }),
    prisma.subscription.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        nextBillingDate: { lt: monthEnd },
      },
      select: { price: true, vendorSharePercent: true, taxable: true },
    }),
  ]);

  let renewedAmount = 0;
  let renewedNetProfit = 0;
  for (const op of billedThisMonth) {
    const amount = Number(op.amount);
    renewedAmount += amount;
    renewedNetProfit += computeWaterfall(amount, Number(op.vendorSharePercent), op.taxable).spendable;
  }

  let pendingAmount = 0;
  let pendingNetProfit = 0;
  for (const s of pendingSubscriptions) {
    const price = Number(s.price);
    pendingAmount += price;
    pendingNetProfit += computeWaterfall(price, Number(s.vendorSharePercent), s.taxable).spendable;
  }

  return {
    totalExpected: renewedAmount + pendingAmount,
    renewedAmount,
    renewedNetProfit,
    projectedNetProfit: renewedNetProfit + pendingNetProfit,
  };
}
