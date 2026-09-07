import { useEffect, useState, type CSSProperties } from "react";
import { CalendarX2, Clock, Repeat, UserMinus, Users } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { CohortRow, RetentionReport } from "../api/types";
import { Badge, Card, Column, DataTable, EmptyState, Field, FilterBar, InlineBar, ListCard, MetaItem, PageHeader, PageSkeleton, RowCard, Select, StatCard, useUi } from "../components/ui";
import { formatDate, formatMoney } from "../utils/format";

type Metric = "bySubscriptions" | "byMrr" | "byClients";

const metricLabel: Record<Metric, string> = {
  bySubscriptions: "по подпискам",
  byMrr: "по доходу в месяц",
  byClients: "по клиентам",
};

function shortMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  // «дек. 25 г.» → «дек 25»: the formatter's own suffixes only add noise in a table header.
  return new Intl.DateTimeFormat("ru-RU", { month: "short", year: "2-digit" }).format(new Date(y, m - 1, 1)).replace(/\./g, "").replace(/\s?г$/, "");
}

function percent(value: number | null | undefined, digits = 0): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(digits).replace(".", ",")} %`;
}

/** Retention share → background: full accent at 100 %, fading toward the surface as the cohort shrinks. */
function cellStyle(share: number | null): CSSProperties | undefined {
  if (share == null) return undefined;
  const alpha = 0.08 + Math.max(0, Math.min(1, share)) * 0.72;
  return { backgroundColor: `color-mix(in oklab, var(--color-accent) ${Math.round(alpha * 100)}%, transparent)` };
}

export function RetentionPage() {
  const ui = useUi();
  const [data, setData] = useState<RetentionReport | null>(null);
  const [months, setMonths] = useState(12);
  const [metric, setMetric] = useState<Metric>("bySubscriptions");

  useEffect(() => {
    setData(null);
    api
      .get<RetentionReport>("/retention", { params: { months } })
      .then((res) => setData(res.data))
      .catch((err) => ui.toast(errorMessage(err, "Не удалось загрузить отчёт"), "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  if (!data) return <PageSkeleton stats={4} rows={6} />;

  const { summary } = data;
  const lifeMonths = Math.max(0, ...data.cohorts.map((c) => c[metric].length));
  const maxReason = Math.max(1, ...data.reasons.map((r) => r.count));

  const monthlyColumns: Column<RetentionReport["monthly"][number]>[] = [
    { key: "month", header: "Месяц", nowrap: true, render: (m) => <span className="font-medium text-ink capitalize">{shortMonth(m.month)}</span> },
    { key: "activeStart", header: "Активных на начало", align: "right", hideBelow: "md", render: (m) => <span className="text-ink-muted">{m.activeStart}</span> },
    { key: "started", header: "Новых", align: "right", render: (m) => <span className="text-income">{m.started > 0 ? `+${m.started}` : "0"}</span> },
    { key: "cancelled", header: "Отменено", align: "right", render: (m) => <span className={m.cancelled > 0 ? "text-expense" : "text-ink-muted"}>{m.cancelled > 0 ? `−${m.cancelled}` : "0"}</span> },
    { key: "churn", header: "Отток", align: "right", render: (m) => <span className="text-ink">{percent(m.churnRate, 1)}</span> },
    { key: "mrrLost", header: "Потеряно в месяц", align: "right", hideBelow: "lg", render: (m) => <span className="text-ink-muted">{m.mrrLost > 0 ? formatMoney(m.mrrLost) : "—"}</span> },
    {
      key: "renewals",
      header: "Продления",
      hideBelow: "md",
      render: (m) =>
        m.renewalsDue === 0 ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-raised">
              <div className="bg-income" style={{ width: `${(m.renewedOnTime / m.renewalsDue) * 100}%` }} />
              <div className="bg-reserve" style={{ width: `${(m.renewedLate / m.renewalsDue) * 100}%` }} />
              <div className="bg-expense" style={{ width: `${(m.notRenewed / m.renewalsDue) * 100}%` }} />
            </div>
            <span className="text-[11px] text-ink-subtle tnum">
              в срок {m.renewedOnTime} · с задержкой {m.renewedLate} · не продлено {m.notRenewed}
              {m.averageDelayDays != null && m.averageDelayDays > 0 ? ` · задержка ~${m.averageDelayDays} дн.` : ""}
            </span>
          </div>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Отток и продления по когортам"
        description="Когорта — месяц, в котором подписка началась. Таблица показывает, какая доля когорты жива через 1, 2, 3… месяцев. Ниже — помесячный отток, дисциплина продлений и причины отмен."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Активных подписок" value={String(summary.activeNow)} icon={Users} />
        <StatCard
          label="Отток за 12 месяцев"
          value={percent(summary.churnRate12m, 1)}
          tone={summary.churnRate12m != null && summary.churnRate12m > 0.2 ? "expense" : "neutral"}
          icon={UserMinus}
          hint={`Отменено ${summary.cancelledLast12m} из тех, что были активны год назад или начались за это время`}
        />
        <StatCard
          label="Средний срок жизни"
          value={summary.averageLifetimeMonths != null ? `${summary.averageLifetimeMonths} мес.` : "—"}
          icon={Clock}
          hint="От старта до отмены по уже отменённым подпискам"
        />
        <StatCard
          label="Продлений в срок"
          value={percent(summary.onTimeRenewalShare)}
          tone={summary.onTimeRenewalShare != null && summary.onTimeRenewalShare < 0.7 ? "reserve" : "income"}
          icon={Repeat}
          hint={summary.lateRenewals30 > 0 ? `За последние 30 дней ${summary.lateRenewals30} продлений прошли с задержкой больше 3 дней` : "Оплачено не позже 3 дней после даты платежа"}
        />
      </div>

      <FilterBar>
        <Field label="Период">
          <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            <option value={6}>6 месяцев</option>
            <option value={12}>12 месяцев</option>
            <option value={18}>18 месяцев</option>
            <option value={24}>24 месяца</option>
          </Select>
        </Field>
        <Field label="Считать">
          <Select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {(Object.keys(metricLabel) as Metric[]).map((m) => (
              <option key={m} value={m}>
                {metricLabel[m]}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      <Card title={`Удержание когорт ${metricLabel[metric]}`}>
        {data.cohorts.length === 0 ? (
          <EmptyState icon={Repeat} title="Когорт пока нет" description="Появятся, когда за выбранный период начнётся хотя бы одна подписка." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface py-1.5 pr-3 text-left font-medium text-ink-subtle">Когорта</th>
                  <th className="py-1.5 pr-3 text-right font-medium text-ink-subtle">Старт</th>
                  {Array.from({ length: lifeMonths }).map((_, i) => (
                    <th key={i} className="min-w-11 py-1.5 text-center font-medium text-ink-subtle tnum">
                      {i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((c: CohortRow) => (
                  <tr key={c.cohort}>
                    <td className="sticky left-0 z-10 bg-surface py-1 pr-3 font-medium whitespace-nowrap text-ink capitalize">{shortMonth(c.cohort)}</td>
                    <td className="py-1 pr-3 text-right whitespace-nowrap text-ink-muted tnum">
                      {metric === "byMrr" ? formatMoney(c.mrr) : metric === "byClients" ? c.clients : c.size}
                    </td>
                    {Array.from({ length: lifeMonths }).map((_, i) => {
                      const share = c[metric][i] ?? null;
                      return (
                        <td key={i} className="p-0.5">
                          <div
                            className={`flex h-8 items-center justify-center rounded-md tnum ${share == null ? "text-ink-subtle/50" : share >= 0.5 ? "text-ink" : "text-ink-muted"}`}
                            style={cellStyle(share)}
                            title={share == null ? "Ещё не наступил" : `${percent(share)} через ${i} мес.`}
                          >
                            {share == null ? "·" : `${Math.round(share * 100)}`}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-ink-subtle">Столбцы — месяцы жизни когорты, в ячейках — доля оставшихся, %. Точка означает, что месяц ещё не наступил.</p>
          </div>
        )}
      </Card>

      <ListCard title="По месяцам">
        <DataTable
          rows={data.monthly}
          columns={monthlyColumns}
          getRowKey={(m) => m.month}
          renderCard={(m) => (
            <RowCard
              title={<span className="capitalize">{shortMonth(m.month)}</span>}
              value={percent(m.churnRate, 1)}
              valueTone={m.churnRate != null && m.churnRate > 0.1 ? "expense" : "neutral"}
              meta={
                <>
                  <MetaItem label="Активных">{m.activeStart}</MetaItem>
                  <MetaItem label="Новых">{m.started}</MetaItem>
                  <MetaItem label="Отменено">{m.cancelled}</MetaItem>
                  {m.renewalsDue > 0 && (
                    <MetaItem label="Продлений">
                      {m.renewedOnTime + m.renewedLate}/{m.renewalsDue}
                    </MetaItem>
                  )}
                </>
              }
            />
          )}
          empty={<EmptyState icon={Repeat} title="Нет данных за период" />}
        />
      </ListCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Причины отмен">
          {data.reasons.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-subtle">Отмен за период не было — или причина не указана</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.reasons.map((r) => (
                <li key={r.reason} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink">{r.reason}</span>
                    <span className="shrink-0 text-ink-muted tnum">
                      {r.count} · <span className="text-expense">−{formatMoney(r.mrrLost)}/мес</span>
                    </span>
                  </div>
                  <InlineBar value={r.count} max={maxReason} tone="expense" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Отменённые подписки">
          {data.churned.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-subtle">За период ничего не отменялось</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.churned.slice(0, 12).map((c) => (
                <li key={c.subscriptionId} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{c.clientName}</div>
                    <div className="truncate text-xs text-ink-muted">{c.productName}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-subtle">
                      <CalendarX2 className="size-3" strokeWidth={1.9} />
                      {formatDate(c.cancelledAt)} · жила {c.lifetimeMonths} мес.
                      {c.reason && <Badge tone="expense">{c.reason}</Badge>}
                    </div>
                    {c.comment && <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{c.comment}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-medium text-expense tnum">−{formatMoney(c.mrr)}/мес</span>
                </li>
              ))}
              {data.churned.length > 12 && <li className="pt-2.5 text-xs text-ink-subtle">…и ещё {data.churned.length - 12}</li>}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
