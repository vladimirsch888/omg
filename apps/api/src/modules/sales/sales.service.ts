import { prisma } from "../../prisma";
import { computeWaterfall } from "../finance/waterfall";

async function getLicenseCostCategoryId(organizationId: string): Promise<string | null> {
  const value = await prisma.dictionaryValue.findFirst({
    where: { organizationId, code: "license_cost", dictionaryType: { code: "operation_category" } },
  });
  return value?.id ?? null;
}

interface RecordSaleInput {
  organizationId: string;
  clientId: string;
  projectId: string | null;
  licenseProductId: string;
  amount: number;
  saleDate: Date;
  workEndDate?: Date | null;
  vendorSharePercent: number;
  taxable: boolean;
  categoryValueId: string | null;
  clientName: string;
  productName: string;
  userId: string;
  isDemo?: boolean;
}

/**
 * Records a one-off sale: unlike a Subscription (which has a billing cycle
 * and a "bill next period" action), a Sale books its operations once, right
 * away, on saleDate. Mirrors billSubscription's income + vendor-cost-expense
 * pattern so the financial waterfall is computed identically everywhere.
 */
export async function recordSale(input: RecordSaleInput) {
  const isDemo = input.isDemo ?? false;

  const sale = await prisma.sale.create({
    data: {
      organizationId: input.organizationId,
      clientId: input.clientId,
      projectId: input.projectId,
      licenseProductId: input.licenseProductId,
      amount: input.amount,
      saleDate: input.saleDate,
      workEndDate: input.workEndDate ?? null,
      vendorSharePercent: input.vendorSharePercent,
      taxable: input.taxable,
      isDemo,
    },
  });

  const incomeOperation = await prisma.operation.create({
    data: {
      organizationId: input.organizationId,
      isDemo,
      projectId: input.projectId,
      saleId: sale.id,
      type: "INCOME",
      status: "ACTUAL",
      amount: input.amount,
      accrualDate: input.saleDate,
      paymentDate: input.saleDate,
      categoryValueId: input.categoryValueId,
      vendorSharePercent: input.vendorSharePercent,
      taxable: input.taxable,
      counterparty: input.clientName,
      description: `Продажа: ${input.productName}`,
      createdById: input.userId,
    },
  });

  let expenseOperation = null;
  if (input.vendorSharePercent > 0) {
    const vendorCategoryId = await getLicenseCostCategoryId(input.organizationId);
    const { vendorCost } = computeWaterfall(input.amount, input.vendorSharePercent, input.taxable);
    expenseOperation = await prisma.operation.create({
      data: {
        organizationId: input.organizationId,
        isDemo,
        projectId: input.projectId,
        saleId: sale.id,
        type: "EXPENSE",
        status: "ACTUAL",
        amount: vendorCost,
        accrualDate: input.saleDate,
        paymentDate: input.saleDate,
        categoryValueId: vendorCategoryId,
        counterparty: "Вендор",
        description: `Оплата вендору за продажу: ${input.productName}`,
        createdById: input.userId,
      },
    });
  }

  return { sale, incomeOperation, expenseOperation };
}
