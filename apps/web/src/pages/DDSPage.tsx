import { lazy, useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { api } from "../api/client";
import { DDSReport } from "../api/types";
import {
  Card,
  Column,
  DataTable,
  ExportButton,
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

const CashFlowChart = lazy(() => import("../components/charts/CashFlowChart"));

type PeriodRow = DDSReport["periods"][number];

export function DDSPage() {
  const ui = useUi();
  const [filters, setFilters] = useState<ReportFilterValues>(defaultReportFilters);
  const [report, setReport] = useState<DDSReport | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get<DDSReport>("/reports/dds", { params: reportParams(filters) }).then((res) => setReport(res.data));
  }, [filters]);

  async function handleExport() {
    setExporting(true);
    try {
      const qs = new URLSearchParams(Object.entries(reportParams(filters)).filter(([, v]) => v) as [string, string][]);
      await downloadFile(`/api/export/dds.csv?${qs}`, "dds.csv");
    } catch (err) {
      ui.toast((err as Error).message, "error");
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<PeriodRow>[] = [
    { key: "period", header: "Месяц", render: (p) => <span className="text-ink">{p.period}</span> },
    { key: "inflow", header: "Приток", align: "right", render: (p) => <span className="text-income">{formatMoney(p.inflow)}</span> },
    { key: "outflow", header: "Отток", align: "right", render: (p) => <span className="text-expense">{formatMoney(p.outflow)}</span> },
    {
      key: "net",
      header: "Чистый поток",
      align: "right",
      hideBelow: "md",
      render: (p) => (
        <span className={p.net >= 0 ? "text-ink" : "text-expense"}>{formatMoney(p.net)}</span>
      ),
    },
    {
      key: "balance",
      header: "Остаток",
      align: "right",
      render: (p) => <span className="font-medium text-ink">{formatMoney(p.cumulativeBalance)}</span>,
    },
  ];

  const scoped = Boolean(filters.clientId || filters.projectId);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="ДДС — движение денежных средств"
        description="Кассовый метод: только фактические платежи по датам, когда деньги действительно пришли или ушли. Остаток считается с учётом денег, накопленных до начала периода."
        actions={<ExportButton onClick={handleExport} loading={exporting} />}
      />

      <ReportFilters value={filters} onChange={setFilters} />

      {!report ? (
        <PageSkeleton stats={3} rows={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
            <StatCard
              label="На начало периода"
              value={formatMoney(report.openingBalance)}
              icon={Wallet}
              hint={scoped ? "по выбранному клиенту или проекту" : "накоплено до первого дня периода"}
            />
            <StatCard label="Приток" value={formatMoney(report.totals.inflow)} tone="income" icon={ArrowUpRight} />
            <StatCard label="Отток" value={formatMoney(report.totals.outflow)} tone="expense" icon={ArrowDownRight} />
            <StatCard
              label="Остаток на конец периода"
              value={formatMoney(report.totals.endingBalance)}
              tone="accent"
              icon={Wallet}
              hint={scoped ? undefined : "совпадает с «Всего на счетах» на дашборде"}
            />
          </div>

          <Card title="Потоки и накопленный остаток">
            {report.periods.length > 0 ? (
              <LazyChart>
                <CashFlowChart data={report.periods} />
              </LazyChart>
            ) : (
              <p className="py-6 text-center text-sm text-ink-subtle">За период нет платежей</p>
            )}
          </Card>

          <Card title="По месяцам">
            <DataTable
              rows={report.periods}
              columns={columns}
              getRowKey={(p) => p.period}
              renderCard={(p) => (
                <RowCard
                  title={p.period}
                  value={formatMoney(p.cumulativeBalance)}
                  valueTone={p.cumulativeBalance >= 0 ? "neutral" : "expense"}
                  subtitle="остаток на конец месяца"
                  meta={
                    <>
                      <MetaItem label="Приток">{formatMoney(p.inflow)}</MetaItem>
                      <MetaItem label="Отток">{formatMoney(p.outflow)}</MetaItem>
                    </>
                  }
                />
              )}
              empty={<p className="py-6 text-center text-sm text-ink-subtle">За период нет платежей</p>}
            />
          </Card>
        </>
      )}
    </div>
  );
}
