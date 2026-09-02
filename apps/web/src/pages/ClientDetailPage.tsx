import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CalendarRange, CornerDownRight, TrendingUp, Wallet } from "lucide-react";
import { api } from "../api/client";
import { Client, ClientLTV, Project, Sale } from "../api/types";
import { Badge, Card, PageSkeleton, StatCard, StatusBadge, type BadgeTone } from "../components/ui";
import { formatDate, formatMoney } from "../utils/format";

const statusLabel: Record<Project["status"], string> = {
  ACTIVE: "Активен",
  PAUSED: "Приостановлен",
  CLOSED: "Закрыт",
};

const statusTone: Record<Project["status"], BadgeTone> = {
  ACTIVE: "income",
  PAUSED: "reserve",
  CLOSED: "neutral",
};

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<(Client & { projects: Project[] }) | null>(null);
  const [ltv, setLtv] = useState<ClientLTV | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get(`/clients/${id}`).then((res) => setClient(res.data));
    api.get<ClientLTV[]>("/reports/ltv", { params: { clientId: id } }).then((res) => setLtv(res.data[0] ?? null));
    api.get<Sale[]>("/sales", { params: { clientId: id } }).then((res) => setSales(res.data));
  }, [id]);

  if (!client) return <PageSkeleton stats={4} rows={4} />;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div>
        <Link
          to="/clients"
          className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.8} />
          Все клиенты
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{client.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {client.legalName}
          {client.inn && ` · ИНН ${client.inn}`}
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

      <Card title="Проекты">
        {client.projects.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {client.projects.map((p) => (
              <li key={p.id} className="rounded-xl border border-line bg-raised/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Link to={`/projects/${p.id}`} className="text-sm font-medium text-ink transition-colors hover:text-accent">
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
                          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-accent"
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
