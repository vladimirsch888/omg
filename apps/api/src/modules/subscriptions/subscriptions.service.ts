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
  nextBillingDate: Date;
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
 * `billingDate` is recorded as the operation's accrual/payment date — the
 * caller decides what that should mean (see call sites). The *schedule*
 * always advances from the subscription's own current `nextBillingDate`
 * (one durationMonths forward), never from `billingDate`: an overdue
 * renewal paid today must not drag the next due date along with it, or a
 * late payment would silently reschedule the whole subscription and (via
 * getMonthSummary) make the just-paid period vanish into a past month
 * while the subscription kept showing as still "pending" this month.
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
      nextBillingDate: addMonths(subscription.nextBillingDate, subscription.durationMonths),
      // The "счёт отправлен" stage ends with the billing it was preparing —
      // the next period starts again with no invoice out.
      invoiceSentAt: null,
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
 * counts as still expected).
 *
 * `pendingNetProfit` is deliberately forecast-only: it covers just the
 * subscriptions that still have to be renewed this month, and does NOT add
 * in what has already been billed (that's `renewedNetProfit`). A 13-month
 * license renewed on the 4th, whose next due date is now next year, must not
 * keep showing up under "expected until the end of the month" — it's done
 * for this month.
 *
 * A subscription usually drops out of "pending" the moment it's billed this
 * month, since renewing pushes its nextBillingDate at least one duration
 * forward from where it was scheduled (see billSubscription — the schedule
 * advances from the OLD due date, not from today, precisely so a late
 * payment doesn't get lost from "renewed" here). The one case where it can
 * legitimately still show up as pending right after being billed is when it
 * was so overdue that even the next scheduled period also falls before the
 * end of this month — that's not double-counting, it's two distinct unpaid
 * periods that both happen to be due in the same calendar month.
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
    pendingNetProfit,
  };
}
