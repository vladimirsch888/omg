import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CalendarClock, CalendarRange, CornerDownRight, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { api } from "../api/client";
import { Client, ClientLTV, Project, Sale, Subscription } from "../api/types";
import { Badge, Card, PageSkeleton, StatCard, StatusBadge, type BadgeTone } from "../components/ui";
import { formatDate, formatMoney } from "../utils/format";

const statusLabel: Record<Project["status"], string> = {
  ACTIVE: "В работе",
  PAUSED: "Приостановлен",
  CLOSED: "Завершён",
};

const statusTone: Record<Project["status"], BadgeTone> = {
  ACTIVE: "income",
  PAUSED: "reserve",
  CLOSED: "neutral",
};

const subscriptionStatusLabel: Record<Subscription["status"], string> = {
  ACTIVE: "Активна",
  PAUSED: "Приостановлена",
  CANCELLED: "Отменена",
};

const subscriptionStatusTone: Record<Subscription["status"], BadgeTone> = {
  ACTIVE: "income",
  PAUSED: "reserve",
  CANCELLED: "neutral",
};

type ClientWithRelations = Client & { projects: Project[]; subscriptions: Subscription[] };

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientWithRelations | null>(null);
  const [ltv, setLtv] = useState<ClientLTV | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get(`/clients/${id}`).then((res) => setClient(res.data));
    api.get<ClientLTV[]>("/reports/ltv", { params: { clientId: id } }).then((res) => setLtv(res.data[0] ?? null));
    api.get<Sale[]>("/sales", { params: { clientId: id } }).then((res) => setSales(res.data));
  }, [id]);

  if (!client) return <PageSkeleton stats={4} rows={4} />;

  const activeSubscriptions = client.subscriptions.filter((s) => s.status === "ACTIVE");
  const monthlyRecurring = activeSubscriptions.reduce((sum, s) => sum + Number(s.price) / s.durationMonths, 0);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div>
        <Link
          to="/clients"
          className="-my-2 inline-flex min-h-10 items-center gap-1.5 py-2 text-xs text-ink-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.8} />
          Все клиенты
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{client.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {client.legalName}
          {client.inn && ` · ИНН ${client.inn}`}
          {client.contactPerson && ` · ${client.contactPerson}`}
        </p>
      </div>

      {ltv && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="Суммарная выручка" value={formatMoney(ltv.totalIncome)} tone="income" icon={ArrowUpRight} />
          <StatCard label="Суммарные расходы" value={formatMoney(ltv.totalExpense)} tone="expense" icon={Wallet} />
          <StatCard label="LTV — чистая прибыль" value={formatMoney(ltv.ltv)} tone="accent" icon={TrendingUp} />
          <StatCard
            label="Средняя выручка в месяц"
            value={formatMoney(ltv.avgMonthlyRevenue)}
            icon={CalendarRange}
            hint={`${ltv.monthsActive} мес. активности`}
          />
        </div>
      )}

      <Card
        title="Подписки"
        action={
          activeSubscriptions.length > 0 ? (
            <span className="text-xs text-ink-subtle tnum">≈ {formatMoney(monthlyRecurring)} в месяц по активным</span>
          ) : undefined
        }
      >
        {client.subscriptions.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {client.subscriptions.map((s) => (
              <li
                key={s.id}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                  s.invoiceSentAt ? "border-reserve/30 bg-reserve-soft" : "border-line bg-raised/40"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link to="/subscriptions" className="-my-1.5 inline-flex min-h-9 min-w-0 items-center truncate py-1.5 text-sm font-medium text-ink transition-colors hover:text-accent">
                      {s.licenseProduct?.name}
                    </Link>
                    <StatusBadge label={subscriptionStatusLabel[s.status]} tone={subscriptionStatusTone[s.status]} />
                    {s.invoiceSentAt && <Badge tone="reserve">счёт от {formatDate(s.invoiceSentAt)}</Badge>}
                    {!s.taxable && <Badge tone="reserve">на карту</Badge>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3" strokeWidth={1.8} />
                      следующий платёж {formatDate(s.nextBillingDate)}
                    </span>
                    <span>каждые {s.durationMonths} мес.</span>
                    {s.project?.name && <span>· {s.project.name}</span>}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink tnum">{formatMoney(s.price)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-ink-subtle">
            <RefreshCw className="mr-1 inline size-3.5 align-[-2px]" strokeWidth={1.8} />
            Подписок пока нет
          </p>
        )}
      </Card>

      <Card title="Проекты">
        {client.projects.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {client.projects.map((p) => (
              <li
                key={p.id}
                className={`rounded-xl border border-line bg-raised/40 p-3 ${
                  p.status === "CLOSED" ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <Link
                    to={`/projects/${p.id}`}
                    className={`-my-1.5 inline-flex min-h-10 items-center py-1.5 text-sm font-medium transition-colors hover:text-accent ${
                      p.status === "CLOSED" ? "text-ink-muted" : "text-ink"
                    }`}
                  >
                    {p.name}
                  </Link>
                  <StatusBadge label={statusLabel[p.status]} tone={statusTone[p.status]} />
                </div>
                {p.children && p.children.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 border-l border-line pl-3">
                    {p.children.map((sp) => (
                      <li key={sp.id}>
                        <Link
                          to={`/projects/${sp.id}`}
                          className={`inline-flex min-h-9 items-center gap-1.5 text-sm transition-colors hover:text-accent ${
                            sp.status === "CLOSED" ? "text-ink-subtle line-through" : "text-ink-muted"
                          }`}
                        >
                          <CornerDownRight className="size-3.5 text-ink-subtle" strokeWidth={1.8} />
                          {sp.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-ink-subtle">У клиента ещё нет проектов</p>
        )}
      </Card>

      <Card title="Продажи">
        {sales.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {sales.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-raised/40 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink">{s.licenseProduct?.name}</span>
                    {!s.taxable && <Badge tone="reserve">на карту</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-subtle">
                    {formatDate(s.saleDate)}
                    {s.project?.name ? ` · ${s.project.name}` : ""}
                    {s.workEndDate ? ` · работы до ${formatDate(s.workEndDate)}` : ""}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-income tnum">{formatMoney(s.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-ink-subtle">Продаж пока нет</p>
        )}
      </Card>
    </div>
  );
}
