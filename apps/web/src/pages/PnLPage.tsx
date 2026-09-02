import { lazy, useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { api } from "../api/client";
import { PnLReport } from "../api/types";
import {
  Card,
  Column,
  DataTable,
  InlineBar,
  MetaItem,
  PageHeader,
  PageSkeleton,
  RowCard,
  StatCard,
} from "../components/ui";
import { LazyChart } from "../components/charts/LazyChart";
import { formatMoney } from "../utils/format";

const PnlBars = lazy(() => import("../components/charts/PnlBars"));

type CategoryRow = PnLReport["byCategory"][number];

export function PnLPage() {
  const [report, setReport] = useState<PnLReport | null>(null);

  useEffect(() => {
    const from = new Date();
    from.setMonth(from.getMonth() - 11);
    from.setDate(1);
    api.get<PnLReport>("/reports/pnl", { params: { from: from.toISOString() } }).then((res) => setReport(res.data));
  }, []);

  if (!report) return <PageSkeleton stats={3} rows={6} />;

  // Bars inside the table are scaled against the largest turnover in the list,
  // so categories are comparable at a glance without reading every number.
  const maxTurnover = Math.max(...report.byCategory.map((c) => Math.max(c.income, c.expense)), 1);

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
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
        <StatCard label="Выручка" value={formatMoney(report.totals.income)} tone="income" icon={ArrowUpRight} />
        <StatCard label="Расходы" value={formatMoney(report.totals.expense)} tone="expense" icon={ArrowDownRight} />
        <StatCard label="Прибыль" value={formatMoney(report.totals.profit)} tone="accent" icon={TrendingUp} />
      </div>

      <Card title="По месяцам">
        <LazyChart>
          <PnlBars data={report.periods} />
        </LazyChart>
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
    </div>
  );
}
