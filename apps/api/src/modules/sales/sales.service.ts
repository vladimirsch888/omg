import { prisma } from "../../prisma";
import { computeWaterfall } from "../finance/waterfall";
import { findVendorCostCategoryId } from "../../utils/ownership";

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
    const vendorCategoryId = await findVendorCostCategoryId(input.organizationId);
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

interface UpdateSaleInput {
  organizationId: string;
  saleId: string;
  clientId: string;
  projectId: string | null;
  licenseProductId: string;
  amount: number;
  saleDate: Date;
  workEndDate: Date | null;
  vendorSharePercent: number;
  taxable: boolean;
  // undefined = leave the linked income operation's category as-is (product
  // wasn't changed); pass the new product's categoryValueId when it was.
  categoryValueId?: string | null;
  clientName: string;
  productName: string;
  userId: string;
}

/**
 * Updates a Sale and keeps its linked operations in sync: the income
 * operation's amount/dates/project/waterfall terms are always refreshed,
 * and the vendor-cost expense operation is created, updated, or removed
 * depending on whether vendorSharePercent is now > 0 — a Sale (unlike a
 * Subscription) has no future billing to correct, so this is the only
 * chance to keep the booked operations honest.
 */
export async function updateSale(input: UpdateSaleInput) {
  const sale = await prisma.sale.update({
    where: { id: input.saleId },
    data: {
      clientId: input.clientId,
      projectId: input.projectId,
      licenseProductId: input.licenseProductId,
      amount: input.amount,
      saleDate: input.saleDate,
      workEndDate: input.workEndDate,
      vendorSharePercent: input.vendorSharePercent,
      taxable: input.taxable,
    },
  });

  const existingOperations = await prisma.operation.findMany({ where: { saleId: sale.id } });
  const existingIncome = existingOperations.find((o) => o.type === "INCOME");
  const existingExpense = existingOperations.find((o) => o.type === "EXPENSE");

  let incomeOperation = null;
  if (existingIncome) {
    const incomeData: Record<string, unknown> = {
      projectId: input.projectId,
      amount: input.amount,
      accrualDate: input.saleDate,
      paymentDate: input.saleDate,
      vendorSharePercent: input.vendorSharePercent,
      taxable: input.taxable,
      counterparty: input.clientName,
      description: `Продажа: ${input.productName}`,
    };
    if (input.categoryValueId !== undefined) incomeData.categoryValueId = input.categoryValueId;
    incomeOperation = await prisma.operation.update({ where: { id: existingIncome.id }, data: incomeData });
  }

  let expenseOperation = null;
  if (input.vendorSharePercent > 0) {
    const { vendorCost } = computeWaterfall(input.amount, input.vendorSharePercent, input.taxable);
    if (existingExpense) {
      expenseOperation = await prisma.operation.update({
        where: { id: existingExpense.id },
        data: {
          projectId: input.projectId,
          amount: vendorCost,
          accrualDate: input.saleDate,
          paymentDate: input.saleDate,
          description: `Оплата вендору за продажу: ${input.productName}`,
        },
      });
    } else {
      const vendorCategoryId = await findVendorCostCategoryId(input.organizationId);
      expenseOperation = await prisma.operation.create({
        data: {
          organizationId: input.organizationId,
          isDemo: sale.isDemo,
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
  } else if (existingExpense) {
    await prisma.operation.delete({ where: { id: existingExpense.id } });
  }

  return { sale, incomeOperation, expenseOperation };
}
