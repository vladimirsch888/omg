import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Client, ClientLTV, Project, Sale } from "../api/types";
import { Card, StatCard } from "../components/Card";
import { formatMoney, formatDate } from "../utils/format";

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

  if (!client) return <div className="text-slate-500">Загрузка…</div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/clients" className="text-sm text-slate-500 hover:underline">
          ← Все клиенты
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{client.name}</h1>
        <p className="text-sm text-slate-500">
          {client.legalName} {client.inn && `· ИНН ${client.inn}`}
        </p>
      </div>

      {ltv && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Суммарная выручка" value={formatMoney(ltv.totalIncome)} />
          <StatCard label="Суммарные расходы" value={formatMoney(ltv.totalExpense)} />
          <StatCard label="LTV (чистая прибыль)" value={formatMoney(ltv.ltv)} />
          <StatCard label="Средняя выручка в месяц" value={formatMoney(ltv.avgMonthlyRevenue)} hint={`${ltv.monthsActive} мес. активности`} />
        </div>
      )}

      <Card title="Проекты">
        <div className="flex flex-col gap-3">
          {client.projects.map((p) => (
            <div key={p.id} className="rounded-md border border-slate-200 p-3">
              <Link to={`/projects/${p.id}`} className="font-medium hover:underline">
                {p.name}
              </Link>
              <span className="ml-2 text-xs text-slate-400">{p.status}</span>
              {p.children && p.children.length > 0 && (
                <div className="mt-2 ml-4 flex flex-col gap-1 border-l border-slate-200 pl-3">
                  {p.children.map((sp) => (
                    <Link key={sp.id} to={`/projects/${sp.id}`} className="text-sm text-slate-600 hover:underline">
                      ↳ {sp.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          {client.projects.length === 0 && <div className="text-sm text-slate-400">Нет проектов</div>}
        </div>
      </Card>

      <Card title="Продажи">
        <div className="flex flex-col gap-2">
          {sales.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border border-slate-200 p-3 text-sm">
              <div>
                <span className="font-medium">{s.licenseProduct?.name}</span>
                <span className="ml-2 text-xs text-slate-400">
                  {formatDate(s.saleDate)}{s.project?.name ? ` · ${s.project.name}` : ""}
                </span>
              </div>
              <span className="font-medium text-green-600">{formatMoney(s.amount)}</span>
            </div>
          ))}
          {sales.length === 0 && <div className="text-sm text-slate-400">Продаж пока нет</div>}
        </div>
      </Card>
    </div>
  );
}
