import { Hono } from "hono";
import { prisma } from "../../prisma";
import { AppError } from "../../utils/errors";
import { buildOperationsWhere, listQuerySchema as operationsQuerySchema } from "../operations/operations.routes";
import { buildSalesWhere, salesQuerySchema } from "../sales/sales.routes";
import { buildTimeEntriesWhere, timeEntriesQuerySchema } from "../timeEntries/timeEntries.routes";
import { parseFilters } from "../reports/reports.routes";
import { getDDS, getPnL } from "../reports/reports.service";
import { computeWaterfall } from "../finance/waterfall";
import { toCsv } from "./csv";
import type { AppEnv } from "../../types/hono";

export const exportRouter = new Hono<AppEnv>();

function csvResponse(c: { body: (b: string, s: number, h: Record<string, string>) => Response }, filename: string, csv: string) {
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });
}

const statusLabel: Record<string, string> = { PLANNED: "план", ACTUAL: "факт" };
const subscriptionStatus: Record<string, string> = { ACTIVE: "Активна", PAUSED: "Приостановлена", CANCELLED: "Отменена" };

/**
 * Every dataset accepts the same filters as its list endpoint, so "export
 * what I see" is literally the list request with .csv on the end.
 */
exportRouter.get("/:dataset", async (c) => {
  const auth = c.get("auth");
  const organizationId = auth.organizationId;
  const dataset = c.req.param("dataset");
  const query = c.req.query();

  switch (dataset) {
    case "operations.csv": {
      const q = operationsQuerySchema.parse({ ...query, page: "1", pageSize: "500" });
      const rows = await prisma.operation.findMany({
        where: buildOperationsWhere(organizationId, q),
        include: {
          project: { select: { name: true, client: { select: { name: true } } } },
          categoryValue: { select: { name: true } },
          accountValue: { select: { name: true } },
        },
        orderBy: { accrualDate: "desc" },
        take: 10_000,
      });
      return csvResponse(
        c,
        "операции.csv",
        toCsv(
          ["Дата начисления", "Дата оплаты", "Тип", "Статус", "Сумма", "Клиент", "Проект", "Категория", "Счёт", "Контрагент", "Описание", "Доля вендора %", "Облагается", "Уплата налога", "Чистая прибыль"],
          rows.map((o) => [
            o.accrualDate,
            o.paymentDate,
            o.type === "INCOME" ? "Доход" : "Расход",
            statusLabel[o.status],
            Number(o.amount),
            o.project?.client.name ?? "",
            o.project?.name ?? "",
            o.categoryValue?.name ?? "",
            o.accountValue?.name ?? "",
            o.counterparty ?? "",
            o.description ?? "",
            o.type === "INCOME" ? Number(o.vendorSharePercent) : "",
            o.type === "INCOME" ? o.taxable : "",
            o.type === "EXPENSE" ? o.taxPayment : "",
            o.type === "INCOME" ? computeWaterfall(Number(o.amount), Number(o.vendorSharePercent), o.taxable).spendable : "",
          ])
        )
      );
    }
    case "sales.csv": {
      const q = salesQuerySchema.parse(query);
      const rows = await prisma.sale.findMany({
        where: buildSalesWhere(organizationId, q),
        include: { client: { select: { name: true } }, project: { select: { name: true } }, licenseProduct: { select: { name: true, type: true } } },
        orderBy: { saleDate: "desc" },
        take: 10_000,
      });
      return csvResponse(
        c,
        "продажи.csv",
        toCsv(
          ["Дата", "Клиент", "Проект", "Продукт", "Тип", "Сумма", "Доля вендора %", "Облагается", "Работы до", "Чистая прибыль"],
          rows.map((s) => [
            s.saleDate,
            s.client.name,
            s.project?.name ?? "",
            s.licenseProduct.name,
            s.licenseProduct.type === "WORK" ? "Работа" : "Лицензия",
            Number(s.amount),
            Number(s.vendorSharePercent),
            s.taxable,
            s.workEndDate,
            computeWaterfall(Number(s.amount), Number(s.vendorSharePercent), s.taxable).spendable,
          ])
        )
      );
    }
    case "subscriptions.csv": {
      const rows = await prisma.subscription.findMany({
        where: { organizationId },
        include: { client: { select: { name: true } }, project: { select: { name: true } }, licenseProduct: { select: { name: true } } },
        orderBy: { nextBillingDate: "asc" },
      });
      return csvResponse(
        c,
        "подписки.csv",
        toCsv(
          ["Клиент", "Продукт", "Проект", "Цена", "Срок, мес.", "Статус", "Начало", "Следующий платёж", "Счёт отправлен", "Доля вендора %", "Облагается", "Чистая прибыль за период"],
          rows.map((s) => [
            s.client.name,
            s.licenseProduct.name,
            s.project?.name ?? "",
            Number(s.price),
            s.durationMonths,
            subscriptionStatus[s.status],
            s.startDate,
            s.nextBillingDate,
            s.invoiceSentAt,
            Number(s.vendorSharePercent),
            s.taxable,
            computeWaterfall(Number(s.price), Number(s.vendorSharePercent), s.taxable).spendable,
          ])
        )
      );
    }
    case "time-entries.csv": {
      const q = timeEntriesQuerySchema.parse({ ...query, page: "1", pageSize: "500" });
      const rows = await prisma.timeEntry.findMany({
        where: buildTimeEntriesWhere(organizationId, q),
        include: { project: { select: { name: true, client: { select: { name: true } } } }, request: { select: { title: true } }, user: { select: { name: true } } },
        orderBy: { date: "desc" },
        take: 10_000,
      });
      return csvResponse(
        c,
        "учёт-часов.csv",
        toCsv(
          ["Дата", "Клиент", "Проект", "Заявка", "Сотрудник", "Часы", "Описание"],
          rows.map((t) => [t.date, t.project.client.name, t.project.name, t.request?.title ?? "", t.user.name, Number(t.hours), t.description ?? ""])
        )
      );
    }
    case "pnl.csv": {
      const report = await getPnL(organizationId, parseFilters(query));
      const rows: (string | number)[][] = report.periods.map((p) => ["Месяц", p.period, p.income, p.expense, p.profit]);
      rows.push(...report.byCategory.map((cat) => ["Категория", cat.categoryName, cat.income, cat.expense, cat.profit]));
      rows.push(["Итого", "", report.totals.income, report.totals.expense, report.totals.profit]);
      return csvResponse(c, "pnl.csv", toCsv(["Разрез", "Название", "Доход", "Расход", "Прибыль"], rows));
    }
    case "dds.csv": {
      const report = await getDDS(organizationId, parseFilters(query));
      const rows: (string | number)[][] = report.periods.map((p) => [p.period, p.inflow, p.outflow, p.net, p.cumulativeBalance]);
      rows.push(["Итого", report.totals.inflow, report.totals.outflow, report.totals.net, report.totals.endingBalance]);
      return csvResponse(c, "dds.csv", toCsv(["Месяц", "Приток", "Отток", "Чистый поток", "Остаток"], rows));
    }
    default:
      throw new AppError(404, "Неизвестный набор данных для экспорта");
  }
});
