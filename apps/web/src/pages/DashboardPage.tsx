import { lazy, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Clock, PiggyBank, TrendingUp, Users } from "lucide-react";
import { api } from "../api/client";
import { CashPosition, CompanySummary, PnLReport } from "../api/types";
import { Card, Delta, InlineBar, PageHeader, PageSkeleton, Sparkline, StatCard } from "../components/ui";
import { LazyChart } from "../components/charts/LazyChart";
import { formatMoney } from "../utils/format";

const TrendChart = lazy(() => import("../components/charts/TrendChart"));
const CategoryDonut = lazy(() => import("../components/charts/CategoryDonut"));

/** Percentage change between the last two periods of a series. */
function trendDelta(values: number[]): number | null {
  if (values.length < 2) return null;
  const previous = values[values.length - 2];
  const current = values[values.length - 1];
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function DashboardPage() {
  const [data, setData] = useState<CompanySummary | null>(null);
  const [cash, setCash] = useState<CashPosition | null>(null);
  const [monthPnl, setMonthPnl] = useState<PnLReport | null>(null);

  useEffect(() => {
    api.get<CompanySummary>("/reports/summary").then((res) => setData(res.data));
    api.get<CashPosition>("/reports/cash-position").then((res) => setCash(res.data));

    // Current month only — the donut answers "на что ушли деньги в этом месяце".
    const from = new Date();
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    api
      .get<PnLReport>("/reports/pnl", { params: { from: from.toISOString() } })
      .then((res) => setMonthPnl(res.data));
  }, []);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.pnlTrend.map((p) => {
      const dds = data.ddsTrend.find((d) => d.period === p.period);
      return {
        period: p.period,
        Прибыль: p.profit,
        Приток: dds?.inflow ?? 0,
        Отток: dds?.outflow ?? 0,
      };
    });
  }, [data]);

  const expenseSlices = useMemo(() => {
    if (!monthPnl) return [];
    return monthPnl.byCategory
      .filter((c) => c.expense > 0)
      .sort((a, b) => b.expense - a.expense)
      .slice(0, 7)
      .map((c) => ({ name: c.categoryName, value: c.expense }));
  }, [monthPnl]);

  if (!data) return <PageSkeleton stats={4} rows={4} />;

  const incomeSeries = data.pnlTrend.map((p) => p.income);
  const expenseSeries = data.pnlTrend.map((p) => p.expense);
  const profitSeries = data.pnlTrend.map((p) => p.profit);
  const expenseTotal = expenseSlices.reduce((sum, s) => sum + s.value, 0);
  const topClients = data.topClients.slice(0, 6);
  const maxLtv = Math.max(...topClients.map((c) => Math.abs(c.ltv)), 1);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="hidden lg:block">
        <PageHeader title="Дашборд" />
      </div>

      {/* The one number the business actually runs on. */}
      {cash && (
        <section className="relative overflow-hidden rounded-xl border border-accent/20 bg-surface p-5 card-shadow sm:p-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(120% 120% at 0% 0%, rgba(63,166,151,0.16) 0%, rgba(63,166,151,0) 55%)",
            }}
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
                <PiggyBank className="size-4 text-accent" strokeWidth={1.75} />
                Свободно к использованию
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-ink tnum sm:text-4xl">
                {formatMoney(cash.spendable)}
              </div>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-subtle">
                Деньги на счетах за вычетом налогового резерва — то, чем можно распоряжаться прямо сейчас.
              </p>
            </div>

            <dl className="flex gap-6 sm:gap-8">
              <div>
                <dt className="text-xs text-ink-muted">Всего на счетах</dt>
                <dd className="mt-1 text-lg font-semibold text-ink tnum">{formatMoney(cash.cumulativeCash)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Резерв на налог ({cash.taxReservePercent}%)</dt>
                <dd className="mt-1 text-lg font-semibold text-reserve tnum">
                  {formatMoney(cash.taxReserveAccrued)}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Выручка за месяц"
          value={formatMoney(data.currentMonth.income)}
          tone="income"
          icon={ArrowUpRight}
          chart={<Sparkline data={incomeSeries} tone="income" />}
          delta={<DeltaOrNull values={incomeSeries} />}
        />
        <StatCard
          label="Расходы за месяц"
          value={formatMoney(data.currentMonth.expense)}
          tone="expense"
          icon={ArrowDownRight}
          chart={<Sparkline data={expenseSeries} tone="expense" />}
          delta={<DeltaOrNull values={expenseSeries} />}
        />
        <StatCard
          label="Прибыль за месяц"
          value={formatMoney(data.currentMonth.profit)}
          icon={TrendingUp}
          tone="accent"
          chart={<Sparkline data={profitSeries} tone="accent" />}
          delta={<DeltaOrNull values={profitSeries} />}
        />
        <StatCard
          label="Часы за месяц"
          value={`${data.hoursThisMonth} ч`}
          icon={Clock}
          hint="Списано в учёте часов по всем проектам"
        />
      </div>

      <Card title="Прибыль и денежный поток за 12 месяцев">
        <LazyChart>
          <TrendChart data={chartData} />
        </LazyChart>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
        <Card title="Структура расходов за месяц">
          {expenseSlices.length > 0 ? (
            <LazyChart height="h-44">
              <CategoryDonut data={expenseSlices} total={expenseTotal} />
            </LazyChart>
          ) : (
            <p className="py-6 text-center text-sm text-ink-subtle">В этом месяце расходов ещё не было</p>
          )}
        </Card>

        <Card title="Топ клиентов по прибыли (LTV)">
          {topClients.length > 0 ? (
            <ul className="flex flex-col gap-3.5">
              {topClients.map((c) => (
                <li key={c.clientId} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-ink">{c.clientName}</span>
                    <span className="shrink-0 text-sm font-medium text-ink tnum">{formatMoney(c.ltv)}</span>
                  </div>
                  <InlineBar value={c.ltv} max={maxLtv} tone={c.ltv >= 0 ? "accent" : "expense"} />
                  <div className="flex items-center gap-3 text-[11px] text-ink-subtle">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" strokeWidth={1.8} />
                      {formatMoney(c.avgMonthlyRevenue)} в месяц
                    </span>
                    <span>{c.monthsActive} мес. с нами</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-ink-subtle">Пока нет данных по клиентам</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function DeltaOrNull({ values }: { values: number[] }) {
  const delta = trendDelta(values);
  if (delta === null) return null;
  return <Delta value={delta} />;
}
