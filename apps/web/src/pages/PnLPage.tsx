import { lazy, useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { api } from "../api/client";
import { PnLReport } from "../api/types";
import {
  Card,
  Column,
  DataTable,
  ExportButton,
  InlineBar,
  MetaItem,
  PageHeader,
  PageSkeleton,
  RowCard,
  StatCard,
  useUi,
} from "../components/ui";
import { LazyChart } from "../components/charts/LazyChart";
import { ReportFilters, defaultReportFilters, reportParams, type ReportFilterValues } from "../components/ReportFilters";
import { downloadFile, formatMoney } from "../utils/format";

const PnlBars = lazy(() => import("../components/charts/PnlBars"));

type CategoryRow = PnLReport["byCategory"][number];

export function PnLPage() {
  const ui = useUi();
  const [filters, setFilters] = useState<ReportFilterValues>(defaultReportFilters);
  const [report, setReport] = useState<PnLReport | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get<PnLReport>("/reports/pnl", { params: reportParams(filters) }).then((res) => setReport(res.data));
  }, [filters]);

  async function handleExport() {
    setExporting(true);
    try {
      const qs = new URLSearchParams(Object.entries(reportParams(filters)).filter(([, v]) => v) as [string, string][]);
      await downloadFile(`/api/export/pnl.csv?${qs}`, "pnl.csv");
    } catch (err) {
      ui.toast((err as Error).message, "error");
    } finally {
      setExporting(false);
    }
  }

  // Bars inside the table are scaled against the largest turnover in the list,
  // so categories are comparable at a glance without reading every number.
  const maxTurnover = report ? Math.max(...report.byCategory.map((c) => Math.max(c.income, c.expense)), 1) : 1;

  const columns: Column<CategoryRow>[] = [
    {
      key: "name",
      header: "Категория",
      render: (c) => (
        <div className="flex flex-col gap-1.5">
          <span className="text-ink">{c.categoryName}</span>
          <InlineBar
            value={Math.max(c.income, c.expense)}
            max={maxTurnover}
            tone={c.income >= c.expense ? "income" : "expense"}
          />
        </div>
      ),
      width: "40%",
    },
    { key: "income", header: "Доход", align: "right", render: (c) => <span className="text-income">{formatMoney(c.income)}</span> },
    { key: "expense", header: "Расход", align: "right", render: (c) => <span className="text-expense">{formatMoney(c.expense)}</span> },
    {
      key: "profit",
      header: "Итого",
      align: "right",
      render: (c) => <span className="font-medium text-ink">{formatMoney(c.profit)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="PnL — прибыли и убытки"
        description="Метод начисления: доходы и расходы попадают в тот месяц, к которому относятся, независимо от даты оплаты."
        actions={<ExportButton onClick={handleExport} loading={exporting} />}
      />

      <ReportFilters value={filters} onChange={setFilters} />

      {!report ? (
        <PageSkeleton stats={3} rows={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
            <StatCard label="Выручка" value={formatMoney(report.totals.income)} tone="income" icon={ArrowUpRight} />
            <StatCard label="Расходы" value={formatMoney(report.totals.expense)} tone="expense" icon={ArrowDownRight} />
            <StatCard label="Прибыль" value={formatMoney(report.totals.profit)} tone="accent" icon={TrendingUp} />
          </div>

          <Card title="По месяцам">
            {report.periods.length > 0 ? (
              <LazyChart>
                <PnlBars data={report.periods} />
              </LazyChart>
            ) : (
              <p className="py-6 text-center text-sm text-ink-subtle">За период нет операций</p>
            )}
          </Card>

          <Card title="По категориям">
            <DataTable
              rows={report.byCategory}
              columns={columns}
              getRowKey={(c) => c.categoryId}
              renderCard={(c) => (
                <RowCard
                  title={c.categoryName}
                  value={formatMoney(c.profit)}
                  valueTone={c.profit >= 0 ? "income" : "expense"}
                  meta={
                    <>
                      <MetaItem label="Доход">{formatMoney(c.income)}</MetaItem>
                      <MetaItem label="Расход">{formatMoney(c.expense)}</MetaItem>
                    </>
                  }
                />
              )}
              empty={<p className="py-6 text-center text-sm text-ink-subtle">За период нет операций</p>}
            />
          </Card>
        </>
      )}
    </div>
  );
}
