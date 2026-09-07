import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, CalendarClock, KeyRound, Search, Users } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { LicensePortfolio, LicenseRow } from "../api/types";
import {
  Badge,
  Card,
  Column,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  Input,
  InlineBar,
  ListCard,
  MetaItem,
  PageHeader,
  PageSkeleton,
  RowCard,
  Select,
  StatCard,
  StatusBadge,
  useUi,
  type BadgeTone,
} from "../components/ui";
import { formatDate, formatMoney, formatSeats } from "../utils/format";

const statusLabel: Record<LicenseRow["status"], string> = {
  ACTIVE: "Активна",
  PAUSED: "Приостановлена",
  CANCELLED: "Отменена",
};

const statusTone: Record<LicenseRow["status"], BadgeTone> = {
  ACTIVE: "income",
  PAUSED: "reserve",
  CANCELLED: "neutral",
};

/** «истекла 3 дн. назад», «через 12 дн.» — the phrase next to the expiry date. */
function daysLeftLabel(days: number): string {
  if (days < 0) return `истекла ${Math.abs(days)} дн. назад`;
  if (days === 0) return "истекает сегодня";
  return `через ${days} дн.`;
}

function daysTone(days: number): BadgeTone {
  if (days < 0) return "expense";
  if (days <= 14) return "reserve";
  return "neutral";
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1)).replace(/\s?г\.$/, "");
}

type Filter = "all" | "expiring" | "upsell" | "mismatch";

export function LicensesPage() {
  const ui = useUi();
  const [data, setData] = useState<LicensePortfolio | null>(null);
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<"ACTIVE" | "ALL">("ACTIVE");

  useEffect(() => {
    api
      .get<LicensePortfolio>("/licenses/portfolio")
      .then((res) => setData(res.data))
      .catch((err) => ui.toast(errorMessage(err, "Не удалось загрузить портфель лицензий"), "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (status === "ACTIVE" && r.status !== "ACTIVE") return false;
      if (vendor && (r.vendor ?? "") !== vendor) return false;
      if (filter === "expiring" && r.daysLeft > 30) return false;
      if (filter === "upsell" && r.upsellHints.length === 0) return false;
      if (filter === "mismatch" && !r.priceMismatch) return false;
      if (q && !`${r.clientName} ${r.productName} ${r.accountRef ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, vendor, filter, status]);

  if (!data) return <PageSkeleton stats={4} rows={6} />;

  const { summary } = data;
  const maxExpiring = Math.max(1, ...data.expirations.map((e) => e.value));
  const maxVendorMrr = Math.max(1, ...data.byVendor.map((v) => v.monthlyRecurring));
  const isFiltered = Boolean(search || vendor || filter !== "all" || status !== "ACTIVE");

  const columns: Column<LicenseRow>[] = [
    {
      key: "client",
      header: "Клиент",
      width: "20%",
      render: (r) => (
        <Link to={`/clients/${r.clientId}`} className="font-medium text-ink transition-colors hover:text-accent">
          {r.clientName}
        </Link>
      ),
    },
    {
      key: "product",
      header: "Лицензия",
      width: "24%",
      render: (r) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-ink-muted">{r.productName}</span>
          <span className="flex flex-wrap items-center gap-1">
            {r.vendor && <Badge tone="accent">{r.vendor}</Badge>}
            {r.tariff && <Badge>{r.tariff}</Badge>}
            {r.accountRef && <span className="text-[11px] text-ink-subtle">{r.accountRef}</span>}
          </span>
        </div>
      ),
    },
    {
      key: "seats",
      header: "Мест",
      align: "right",
      render: (r) => <span className="text-ink tnum">{r.seats ?? "—"}</span>,
    },
    {
      key: "perSeat",
      header: "За место",
      align: "right",
      hideBelow: "lg",
      render: (r) =>
        r.effectivePerSeat != null ? (
          <span className={`tnum ${r.priceMismatch ? "text-reserve" : "text-ink-muted"}`}>
            {formatMoney(r.effectivePerSeat)}
            {r.priceMismatch && r.pricePerSeat != null && (
              <span className="block text-[11px] text-ink-subtle">каталог {formatMoney(r.pricePerSeat)}</span>
            )}
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      key: "monthly",
      header: "В месяц",
      align: "right",
      hideBelow: "md",
      render: (r) => <span className="font-medium text-ink tnum">{formatMoney(r.monthlyValue)}</span>,
    },
    {
      key: "expires",
      header: "Окончание",
      nowrap: true,
      render: (r) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={daysTone(r.daysLeft)}>
            <CalendarClock className="size-3" strokeWidth={1.9} />
            {formatDate(r.expiresAt)}
          </Badge>
          <span className="text-[11px] text-ink-subtle">{daysLeftLabel(r.daysLeft)}</span>
        </div>
      ),
    },
    {
      key: "hints",
      header: "Сигналы",
      hideBelow: "xl",
      render: (r) =>
        r.upsellHints.length > 0 || r.priceMismatch ? (
          <ul className="flex flex-col gap-0.5 text-xs text-ink-muted">
            {r.upsellHints.map((h) => (
              <li key={h} className="flex items-center gap-1">
                <ArrowUpRight className="size-3 shrink-0 text-income" strokeWidth={2} />
                {h}
              </li>
            ))}
            {r.priceMismatch && (
              <li className="flex items-center gap-1">
                <AlertTriangle className="size-3 shrink-0 text-reserve" strokeWidth={2} />
                цена не совпадает с каталогом
              </li>
            )}
          </ul>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      key: "status",
      header: "Статус",
      hideBelow: "lg",
      render: (r) => <StatusBadge label={statusLabel[r.status]} tone={statusTone[r.status]} />,
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Портфель лицензий"
        description="Все лицензии клиентов одним списком: вендор, тариф, места, цена за место и дата окончания. Здесь видно, что заканчивается в ближайший месяц и где можно продать больше мест или тариф выше."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Активных лицензий" value={String(summary.activeLicenses)} icon={KeyRound} hint="Подписки со статусом «Активна»" />
        <StatCard
          label="Мест всего"
          value={String(summary.totalSeats)}
          icon={Users}
          hint={summary.averagePerSeat != null ? `В среднем ${formatMoney(summary.averagePerSeat)} за место в месяц` : "Укажите количество мест в подписках"}
        />
        <StatCard label="Регулярный доход в месяц" value={formatMoney(summary.monthlyRecurring)} tone="income" icon={ArrowUpRight} hint="Цена ÷ срок по всем активным лицензиям" />
        <StatCard
          label="Истекает в этом месяце"
          value={String(summary.expiringThisMonth)}
          tone={summary.expiringThisMonth > 0 ? "reserve" : "neutral"}
          icon={CalendarClock}
          hint={summary.expiringThisMonth > 0 ? `На сумму ${formatMoney(summary.expiringThisMonthValue)} — пора выставлять счета` : "Ничего не заканчивается до конца месяца"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Окончания на 6 месяцев">
          {data.expirations.every((e) => e.licenses === 0) ? (
            <p className="py-4 text-center text-sm text-ink-subtle">В ближайшие полгода ни одна лицензия не заканчивается</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.expirations.map((e) => (
                <li key={e.month} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="capitalize text-ink">{monthLabel(e.month)}</span>
                    <span className="shrink-0 text-ink-muted tnum">
                      {e.licenses} лиц. · <span className="font-medium text-ink">{formatMoney(e.value)}</span>
                    </span>
                  </div>
                  <InlineBar value={e.value} max={maxExpiring} tone="accent" />
                  {Object.keys(e.byVendor).length > 0 && (
                    <div className="flex flex-wrap gap-x-3 text-[11px] text-ink-subtle">
                      {Object.entries(e.byVendor).map(([v, n]) => (
                        <span key={v}>
                          {v}: {n}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="По вендорам и тарифам">
          {data.byVendor.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-subtle">Укажите вендора у продуктов-лицензий в разделе «Продукты»</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.byVendor.map((v) => (
                <li key={v.vendor} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink">{v.vendor}</span>
                    <span className="shrink-0 text-ink-muted tnum">
                      {v.licenses} лиц. · {formatSeats(v.seats)} · <span className="font-medium text-ink">{formatMoney(v.monthlyRecurring)}/мес</span>
                    </span>
                  </div>
                  <InlineBar value={v.monthlyRecurring} max={maxVendorMrr} tone="income" />
                </li>
              ))}
            </ul>
          )}
          {data.byTariff.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
              {data.byTariff.map((t) => (
                <Badge key={t.tariff}>
                  {t.tariff}: {t.licenses} лиц., {formatSeats(t.seats)}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </div>

      <FilterBar>
        <Field label="Поиск" className="min-w-48 flex-1 sm:max-w-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" strokeWidth={1.8} />
            <Input placeholder="Клиент, лицензия или аккаунт" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </Field>
        <Field label="Вендор">
          <Select value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">Все</option>
            {data.byVendor.map((v) => (
              <option key={v.vendor} value={v.vendor}>
                {v.vendor}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Показать">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">Все лицензии</option>
            <option value="expiring">Истекают в течение 30 дней</option>
            <option value="upsell">Кандидаты на допродажу{summary.upsellCandidates > 0 ? ` (${summary.upsellCandidates})` : ""}</option>
            <option value="mismatch">Цена не по каталогу</option>
          </Select>
        </Field>
        <Field label="Статус">
          <Select value={status} onChange={(e) => setStatus(e.target.value as "ACTIVE" | "ALL")}>
            <option value="ACTIVE">Только активные</option>
            <option value="ALL">Все, включая отменённые</option>
          </Select>
        </Field>
      </FilterBar>

      <ListCard>
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.subscriptionId}
          rowClassName={(r) => (r.daysLeft < 0 && r.status === "ACTIVE" ? "bg-expense-soft/40 hover:bg-expense-soft/40" : "")}
          renderCard={(r) => (
            <RowCard
              title={<Link to={`/clients/${r.clientId}`}>{r.clientName}</Link>}
              subtitle={r.productName}
              value={formatMoney(r.monthlyValue) + "/мес"}
              meta={
                <>
                  <Badge tone={daysTone(r.daysLeft)}>
                    <CalendarClock className="size-3" strokeWidth={1.9} />
                    {formatDate(r.expiresAt)} · {daysLeftLabel(r.daysLeft)}
                  </Badge>
                  {r.vendor && <Badge tone="accent">{r.vendor}</Badge>}
                  {r.tariff && <Badge>{r.tariff}</Badge>}
                  <MetaItem label="Мест">{r.seats ?? "—"}</MetaItem>
                  {r.effectivePerSeat != null && <MetaItem label="За место">{formatMoney(r.effectivePerSeat)}</MetaItem>}
                  <StatusBadge label={statusLabel[r.status]} tone={statusTone[r.status]} />
                  {r.upsellHints.map((h) => (
                    <span key={h} className="inline-flex items-center gap-1 text-income">
                      <ArrowUpRight className="size-3" strokeWidth={2} />
                      {h}
                    </span>
                  ))}
                  {r.priceMismatch && (
                    <span className="inline-flex items-center gap-1 text-reserve">
                      <AlertTriangle className="size-3" strokeWidth={2} />
                      цена не по каталогу
                    </span>
                  )}
                </>
              }
            />
          )}
          empty={
            <EmptyState
              icon={KeyRound}
              title={isFiltered ? "Ничего не найдено" : "Лицензий пока нет"}
              description={isFiltered ? "Попробуйте изменить поиск или фильтр." : "Портфель строится из подписок: создайте подписку на продукт-лицензию — она появится здесь."}
            />
          }
        />
      </ListCard>
    </div>
  );
}
