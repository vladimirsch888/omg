import { lazy, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BellRing, Clock, Landmark, PiggyBank, TrendingUp, Users } from "lucide-react";
import { api } from "../api/client";
import { CashPosition, CompanySummary, PnLReport, Reminder } from "../api/types";
import { Badge, Card, Delta, InlineBar, PageHeader, PageSkeleton, Sparkline, StatCard, type BadgeTone } from "../components/ui";
import { LazyChart } from "../components/charts/LazyChart";
import { formatHours, formatMoney } from "../utils/format";

const TrendChart = lazy(() => import("../components/charts/TrendChart"));
const CategoryDonut = lazy(() => import("../components/charts/CategoryDonut"));

/**
 * Percentage change of the running month against the previous one, with the
 * running month scaled to a full month by the share of days elapsed. A plain
 * comparison shows "−90 %" on the 3rd of every month, which is noise, not
 * information.
 */
function trendDelta(values: number[], progress: { day: number; daysInMonth: number }): number | null {
  if (values.length < 2) return null;
  const previous = values[values.length - 2];
  const share = Math.max(progress.day / progress.daysInMonth, 1 / progress.daysInMonth);
  const currentRunRate = values[values.length - 1] / share;
  if (!previous) return null;
  return ((currentRunRate - previous) / Math.abs(previous)) * 100;
}

const reminderTone: Record<Reminder["kind"], BadgeTone> = {
  overdue: "expense",
  due_soon: "reserve",
  invoice_stale: "reserve",
  work_deadline: "accent",
  request_high: "expense",
};

const reminderLink: Record<Reminder["entity"], string> = {
  subscription: "/subscriptions",
  sale: "/sales",
  request: "/requests",
};

export function DashboardPage() {
  const [data, setData] = useState<CompanySummary | null>(null);
  const [cash, setCash] = useState<CashPosition | null>(null);
  const [monthPnl, setMonthPnl] = useState<PnLReport | null>(null);
  const [reminders, setReminders] = useState<Reminder[] | null>(null);

  useEffect(() => {
    api.get<CompanySummary>("/reports/summary").then((res) => setData(res.data));
    api.get<CashPosition>("/reports/cash-position").then((res) => setCash(res.data));
    api.get<{ reminders: Reminder[] }>("/reminders").then((res) => setReminders(res.data.reminders)).catch(() => setReminders([]));

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
  const urgent = (reminders ?? []).filter((r) => r.kind === "overdue" || r.kind === "invoice_stale" || r.kind === "request_high").length;

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
                Деньги на счетах за вычетом ещё не уплаченного налогового резерва — то, чем можно распоряжаться прямо сейчас.
              </p>
            </div>

            <dl className="flex flex-wrap gap-6 sm:gap-8">
              <div>
                <dt className="text-xs text-ink-muted">Всего на счетах</dt>
                <dd className="mt-1 text-lg font-semibold text-ink tnum">{formatMoney(cash.cumulativeCash)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Резерв на налог ({cash.taxReservePercent}%)</dt>
                <dd className="mt-1 text-lg font-semibold text-reserve tnum">{formatMoney(cash.taxReserveOutstanding)}</dd>
                {cash.taxPaid > 0 && (
                  <dd className="mt-0.5 text-[11px] text-ink-subtle tnum">
                    начислено {formatMoney(cash.taxReserveAccrued)}, уплачено {formatMoney(cash.taxPaid)}
                  </dd>
                )}
              </div>
            </dl>
          </div>

          {cash.accountBalances.length > 1 && (
            <dl className="relative mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-xs">
              {cash.accountBalances.map((a) => (
                <div key={a.accountId ?? "none"} className="inline-flex items-center gap-2">
                  <Landmark className="size-3.5 text-ink-subtle" strokeWidth={1.75} />
                  <dt className="text-ink-muted">{a.name}</dt>
                  <dd className={`font-medium tnum ${a.balance < 0 ? "text-expense" : "text-ink"}`}>{formatMoney(a.balance)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Выручка за месяц"
          value={formatMoney(data.currentMonth.income)}
          tone="income"
          icon={ArrowUpRight}
          chart={<Sparkline data={incomeSeries} tone="income" />}
          delta={<DeltaOrNull values={incomeSeries} progress={data.monthProgress} />}
        />
        <StatCard
          label="Расходы за месяц"
          value={formatMoney(data.currentMonth.expense)}
          tone="expense"
          icon={ArrowDownRight}
          chart={<Sparkline data={expenseSeries} tone="expense" />}
          delta={<DeltaOrNull values={expenseSeries} progress={data.monthProgress} />}
        />
        <StatCard
          label="Прибыль за месяц"
          value={formatMoney(data.currentMonth.profit)}
          icon={TrendingUp}
          tone="accent"
          chart={<Sparkline data={profitSeries} tone="accent" />}
          delta={<DeltaOrNull values={profitSeries} progress={data.monthProgress} />}
        />
        <StatCard
          label="Часы за месяц"
          value={formatHours(data.hoursThisMonth)}
          icon={Clock}
          hint="Списано в учёте часов по всем проектам"
        />
      </div>

      <Card
        title="Требует внимания"
        action={
          reminders && reminders.length > 0 ? (
            <Badge tone={urgent > 0 ? "expense" : "reserve"}>
              <BellRing className="size-3" strokeWidth={1.9} />
              {reminders.length}
            </Badge>
          ) : undefined
        }
      >
        {reminders === null ? (
          <p className="py-4 text-center text-sm text-ink-subtle">Проверяю…</p>
        ) : reminders.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-subtle">Просроченных продлений, неоплаченных счетов и срочных заявок нет.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {reminders.slice(0, 8).map((r) => (
              <li key={`${r.entity}-${r.entityId}-${r.kind}`} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${r.kind === "overdue" || r.kind === "request_high" ? "bg-expense-soft text-expense" : "bg-reserve-soft text-reserve"}`}>
                  <AlertTriangle className="size-3.5" strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={reminderLink[r.entity]} className="-my-1 inline-flex min-h-9 items-center py-1 text-sm font-medium text-ink transition-colors hover:text-accent">
                    {r.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-ink-muted">{r.detail}</div>
                </div>
                <Badge tone={reminderTone[r.kind]}>
                  {r.days < 0 ? `${-r.days} дн.` : r.days === 0 ? "сегодня" : `${r.days} дн.`}
                </Badge>
              </li>
            ))}
            {reminders.length > 8 && (
              <li className="pt-2.5 text-xs text-ink-subtle">…и ещё {reminders.length - 8}</li>
            )}
          </ul>
        )}
      </Card>

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
                    <Link to={`/clients/${c.clientId}`} className="-my-1.5 inline-flex min-h-9 min-w-0 items-center truncate py-1.5 text-sm text-ink transition-colors hover:text-accent">
                      {c.clientName}
                    </Link>
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

function DeltaOrNull({ values, progress }: { values: number[]; progress: { day: number; daysInMonth: number } }) {
  const delta = trendDelta(values, progress);
  if (delta === null) return null;
  return <Delta value={delta} suffix="к прошлому месяцу, по темпу" />;
}
