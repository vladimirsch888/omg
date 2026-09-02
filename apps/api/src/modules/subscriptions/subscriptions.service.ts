import { prisma } from "../../prisma";

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
