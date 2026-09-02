import { lazy, useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { api } from "../api/client";
import { DDSReport } from "../api/types";
import {
  Card,
  Column,
  DataTable,
  MetaItem,
  PageHeader,
  PageSkeleton,
  RowCard,
  StatCard,
} from "../components/ui";
import { LazyChart } from "../components/charts/LazyChart";
import { formatMoney } from "../utils/format";

const CashFlowChart = lazy(() => import("../components/charts/CashFlowChart"));

type PeriodRow = DDSReport["periods"][number];

export function DDSPage() {
  const [report, setReport] = useState<DDSReport | null>(null);

  useEffect(() => {
    const from = new Date();
    from.setMonth(from.getMonth() - 11);
    from.setDate(1);
    api.get<DDSReport>("/reports/dds", { params: { from: from.toISOString() } }).then((res) => setReport(res.data));
  }, []);

  if (!report) return <PageSkeleton stats={3} rows={6} />;

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

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="ДДС — движение денежных средств"
        description="Кассовый метод: только фактические платежи по датам, когда деньги действительно пришли или ушли."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
        <StatCard label="Приток" value={formatMoney(report.totals.inflow)} tone="income" icon={ArrowUpRight} />
        <StatCard label="Отток" value={formatMoney(report.totals.outflow)} tone="expense" icon={ArrowDownRight} />
        <StatCard
          label="Остаток на конец периода"
          value={formatMoney(report.totals.endingBalance)}
          tone="accent"
          icon={Wallet}
        />
      </div>

      <Card title="Потоки и накопленный остаток">
        <LazyChart>
          <CashFlowChart data={report.periods} />
        </LazyChart>
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
    </div>
  );
}
