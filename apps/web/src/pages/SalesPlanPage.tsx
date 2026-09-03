import { FormEvent, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Coins, Repeat, Split, Target, TrendingUp, Wand2 } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { SalesPlanReport } from "../api/types";
import { useAuth } from "../context/AuthContext";
import {
  Badge,
  Button,
  Card,
  Column,
  DataTable,
  Field,
  IconButton,
  InlineBar,
  Input,
  MetaItem,
  Modal,
  PageHeader,
  PageSkeleton,
  RowCard,
  StatCard,
  useUi,
} from "../components/ui";
import { LazyChart } from "../components/charts/LazyChart";
import { formatMoney } from "../utils/format";

const PlanFactChart = lazy(() => import("../components/charts/PlanFactChart"));
const ProfitMixDonut = lazy(() => import("../components/charts/ProfitMixDonut"));

const monthNames = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const monthShort = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

type MonthRow = SalesPlanReport["months"][number];

/** Empty string = "no plan set", which is different from a plan of 0. */
function toInput(value: number | null): string {
  return value === null ? "" : String(value);
}

function toAmount(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export function SalesPlanPage() {
  const ui = useUi();
  const { canEdit } = useAuth();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [year, setYear] = useState(currentYear);
  const [report, setReport] = useState<SalesPlanReport | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [annualDraft, setAnnualDraft] = useState("");
  const [monthDrafts, setMonthDrafts] = useState<string[]>(Array(12).fill(""));

  const load = useCallback(
    (targetYear: number) => {
      api
        .get<SalesPlanReport>("/sales-plans/report", { params: { year: targetYear } })
        .then((res) => setReport(res.data));
    },
    []
  );

  useEffect(() => {
    setReport(null);
    load(year);
  }, [year, load]);

  const chartData = useMemo(
    () =>
      (report?.months ?? []).map((m) => ({
        month: monthShort[m.month - 1],
        План: m.plan,
        Факт: m.fact,
        Прогноз: m.subscriptionForecast,
      })),
    [report]
  );

  function openForm() {
    if (!report) return;
    setAnnualDraft(toInput(report.annualPlan));
    setMonthDrafts(report.months.map((m) => toInput(m.plan)));
    setFormOpen(true);
  }

  /** Spreads the annual target evenly, giving the remainder to December. */
  function spreadAnnual() {
    const annual = toAmount(annualDraft);
    if (annual === null || annual <= 0) {
      ui.toast("Сначала укажите годовой план", "error");
      return;
    }
    const perMonth = Math.floor(annual / 12);
    const drafts = Array(12).fill(String(perMonth));
    drafts[11] = String(annual - perMonth * 11);
    setMonthDrafts(drafts);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/sales-plans", {
        year,
        annual: toAmount(annualDraft),
        months: monthDrafts.map((value, i) => ({ month: i + 1, amount: toAmount(value) })),
      });
      ui.toast(`Планы на ${year} год сохранены`, "success");
      setFormOpen(false);
      load(year);
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось сохранить планы"), "error");
    } finally {
      setSaving(false);
    }
  }

  if (!report) return <PageSkeleton stats={4} rows={6} />;

  const target = report.annualPlan ?? report.monthlyPlanTotal;
  const thisMonth = year === currentYear ? report.months[currentMonth - 1] : null;
  const maxValue = Math.max(...report.months.map((m) => Math.max(m.fact, m.plan ?? 0)), 1);

  const profitSlices = [
    { kind: "license" as const, name: "Лицензии", value: report.profitMix.license },
    { kind: "work" as const, name: "Работы", value: report.profitMix.work },
    { kind: "other" as const, name: "Прочее", value: report.profitMix.other },
  ];

  const completion = (m: MonthRow) => (m.plan && m.plan > 0 ? Math.round((m.fact / m.plan) * 100) : null);

  const completionBadge = (m: MonthRow) => {
    const percent = completion(m);
    if (percent === null) return <span className="text-ink-subtle">—</span>;
    return <Badge tone={percent >= 100 ? "income" : percent >= 80 ? "reserve" : "expense"}>{percent}%</Badge>;
  };

  const columns: Column<MonthRow>[] = [
    {
      key: "month",
      header: "Месяц",
      render: (m) => (
        <span className={`${m.month === currentMonth && year === currentYear ? "font-medium text-ink" : "text-ink-muted"}`}>
          {monthNames[m.month - 1]}
        </span>
      ),
    },
    {
      key: "plan",
      header: "План",
      align: "right",
      render: (m) => (m.plan === null ? <span className="text-ink-subtle">—</span> : <span className="text-ink-muted">{formatMoney(m.plan)}</span>),
    },
    {
      key: "fact",
      header: "Факт",
      align: "right",
      render: (m) => (
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-medium text-ink">{formatMoney(m.fact)}</span>
          <div className="w-24">
            <InlineBar value={m.fact} max={maxValue} tone={m.plan && m.fact >= m.plan ? "income" : "accent"} />
          </div>
        </div>
      ),
    },
    {
      key: "diff",
      header: "Отклонение",
      align: "right",
      hideBelow: "md",
      render: (m) => {
        if (m.plan === null) return <span className="text-ink-subtle">—</span>;
        const diff = m.fact - m.plan;
        return (
          <span className={diff >= 0 ? "text-income" : "text-expense"}>
            {diff >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(diff))}
          </span>
        );
      },
    },
    {
      key: "netProfit",
      header: "Чистая прибыль",
      align: "right",
      hideBelow: "lg",
      render: (m) => <span className="text-ink-muted">{formatMoney(m.netProfit)}</span>,
    },
    { key: "completion", header: "Выполнение", align: "right", render: completionBadge },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="План продаж"
        description="Годовой план и планы по месяцам. Факт — начисленная выручка за месяц (та же база, что в PnL), а рядом видно, какую долю чистой прибыли принесли лицензии, а какую — работы."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-lg border border-line bg-raised px-1">
              <IconButton icon={ChevronLeft} label="Предыдущий год" disabled={year <= MIN_YEAR} onClick={() => setYear(year - 1)} />
              <span className="min-w-12 text-center text-sm font-medium text-ink tnum">{year}</span>
              <IconButton icon={ChevronRight} label="Следующий год" disabled={year >= MAX_YEAR} onClick={() => setYear(year + 1)} />
            </div>
            {canEdit && (
              <Button variant="primary" icon={Target} onClick={openForm}>
                Настроить планы
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Годовой план"
          value={report.annualPlan === null ? "не задан" : formatMoney(report.annualPlan)}
          icon={Target}
          tone="accent"
          hint={
            report.annualPlan !== null && report.annualPlan !== report.monthlyPlanTotal
              ? `Сумма планов по месяцам: ${formatMoney(report.monthlyPlanTotal)}`
              : undefined
          }
        />
        <StatCard label="Факт за год" value={formatMoney(report.totals.fact)} icon={Coins} />
        <StatCard
          label="Прогноз с учётом подписок"
          value={formatMoney(report.totals.forecast)}
          tone={
            report.totals.forecastPercent !== null && report.totals.forecastPercent >= 100 ? "income" : "reserve"
          }
          icon={Repeat}
          hint={`Факт плюс ${formatMoney(report.totals.subscriptionForecast)} — активные подписки до конца года${
            report.totals.forecastPercent !== null ? `, это ${report.totals.forecastPercent}% плана` : ""
          }`}
        />
        <StatCard
          label="Чистая прибыль за год"
          value={formatMoney(report.totals.netProfit)}
          icon={TrendingUp}
          hint="Выручка минус доля вендора и налоговый резерв"
        />
      </div>

      {/* Both scales in one place: the year, and the month you're actually in. */}
      <Card title="Выполнение плана">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <PlanProgress
            label={`Годовой план ${year}`}
            fact={report.totals.fact}
            forecast={report.totals.subscriptionForecast}
            plan={target > 0 ? target : null}
          />
          <PlanProgress
            label={thisMonth ? `План на ${monthNames[currentMonth - 1].toLowerCase()}` : "Текущий месяц"}
            fact={thisMonth?.fact ?? 0}
            forecast={thisMonth?.subscriptionForecast ?? 0}
            plan={thisMonth?.plan ?? null}
            emptyHint={thisMonth ? undefined : `${year} год — не текущий, месячная шкала считается по текущему месяцу`}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-3">
        <Card title="План и факт по месяцам" className="xl:col-span-2">
          <LazyChart>
            <PlanFactChart data={chartData} />
          </LazyChart>
        </Card>

        <Card
          title="Чистая прибыль: лицензии и работы"
          action={<Split className="size-4 text-ink-subtle" strokeWidth={1.75} />}
        >
          <LazyChart height="h-64">
            <ProfitMixDonut data={profitSlices} total={report.profitMix.total} />
          </LazyChart>
          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-subtle">
            Доход относится к лицензиям или работам по подписке и продаже, а для операций, заведённых
            вручную, — по категории через каталог продуктов. Если что-то попало в «Прочее», заведите
            продукт нужного типа с этой категорией.
          </p>
        </Card>
      </div>

      <Card title={`Помесячно за ${year} год`}>
        <DataTable
          rows={report.months}
          columns={columns}
          getRowKey={(m) => String(m.month)}
          renderCard={(m) => (
            <RowCard
              title={monthNames[m.month - 1]}
              subtitle={m.plan === null ? "план не задан" : `план ${formatMoney(m.plan)}`}
              value={formatMoney(m.fact)}
              valueTone={m.plan !== null && m.fact >= m.plan ? "income" : "neutral"}
              meta={
                <>
                  {completionBadge(m)}
                  <MetaItem label="Прибыль">{formatMoney(m.netProfit)}</MetaItem>
                </>
              }
            />
          )}
        />
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={`Планы продаж на ${year} год`}
        description="Пустое поле — план не задан. Годовой план и месячные задаются независимо."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="sales-plan-form" type="submit" loading={saving}>
              Сохранить
            </Button>
          </>
        }
      >
        <form id="sales-plan-form" onSubmit={handleSubmit} className="flex flex-col gap-4 pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Годовой план" className="flex-1">
              <Input
                type="number"
                min="0"
                step="1000"
                inputMode="decimal"
                placeholder="Например, 4 200 000"
                value={annualDraft}
                onChange={(e) => setAnnualDraft(e.target.value)}
              />
            </Field>
            <Button type="button" variant="secondary" icon={Wand2} onClick={spreadAnnual}>
              Разбить по месяцам
            </Button>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-ink-muted">Планы по месяцам</div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {monthDrafts.map((value, i) => (
                <Field key={i} label={monthNames[i]}>
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) =>
                      setMonthDrafts((prev) => prev.map((v, index) => (index === i ? e.target.value : v)))
                    }
                  />
                </Field>
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/**
 * One target, one bar: what's already earned (solid) plus what active
 * subscriptions are still scheduled to bill (translucent), against the plan.
 * The two segments are drawn as one bar so the reader sees where the period
 * lands if nothing new is sold — the question a plan is set to answer.
 */
function PlanProgress({
  label,
  fact,
  forecast,
  plan,
  emptyHint,
}: {
  label: string;
  fact: number;
  forecast: number;
  plan: number | null;
  emptyHint?: string;
}) {
  if (!plan || plan <= 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-muted">{label}</span>
        <span className="text-sm text-ink-subtle">{emptyHint ?? "План не задан"}</span>
      </div>
    );
  }

  const factPercent = Math.round((fact / plan) * 100);
  const forecastPercent = Math.round(((fact + forecast) / plan) * 100);
  const remaining = Math.max(0, plan - fact - forecast);
  // Segments are capped together so an overshoot fills the bar instead of
  // overflowing it; the number above still shows the real percentage.
  const factWidth = Math.min(100, factPercent);
  const forecastWidth = Math.max(0, Math.min(100 - factWidth, forecastPercent - factPercent));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink-muted">{label}</span>
        <span className={`text-sm font-semibold tnum ${factPercent >= 100 ? "text-income" : "text-ink"}`}>
          {factPercent}%
        </span>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-raised">
        <div className={factPercent >= 100 ? "bg-income" : "bg-accent"} style={{ width: `${factWidth}%` }} />
        <div className="bg-accent/35" style={{ width: `${forecastWidth}%` }} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-ink-subtle">
        <span className="tnum">
          {formatMoney(fact)} из {formatMoney(plan)}
        </span>
        {forecast > 0 ? (
          <span className="tnum">
            +{formatMoney(forecast)} по подпискам → {forecastPercent}%
          </span>
        ) : (
          <span className="tnum">{remaining > 0 ? `осталось ${formatMoney(remaining)}` : "план выполнен"}</span>
        )}
      </div>
    </div>
  );
}
