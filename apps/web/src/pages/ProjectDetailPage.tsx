import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Operation, Project, RequestTicket } from "../api/types";
import { Card, StatCard } from "../components/Card";
import { formatMoney, formatDate } from "../utils/format";

interface ProjectSummary {
  income: number;
  expense: number;
  profit: number;
  hours: number;
  includedProjectIds: string[];
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [requests, setRequests] = useState<RequestTicket[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get<Project>(`/projects/${id}`).then((res) => setProject(res.data));
    api.get<ProjectSummary>(`/projects/${id}/summary`).then((res) => setSummary(res.data));
    api.get(`/operations`, { params: { projectId: id, pageSize: 20 } }).then((res) => setOperations(res.data.items));
    api.get<RequestTicket[]>(`/requests`, { params: { projectId: id } }).then((res) => setRequests(res.data));
  }, [id]);

  if (!project || !summary) return <div className="text-slate-500">Загрузка…</div>;

  const hasChildren = (project.children?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/projects" className="text-sm text-slate-500 hover:underline">
          ← Все проекты
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-slate-500">
          Клиент: <Link to={`/clients/${project.clientId}`} className="hover:underline">{project.client?.name}</Link>
          {project.parentId && " · подпроект"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Доход" value={formatMoney(summary.income)} hint={hasChildren ? "с учётом подпроектов" : undefined} />
        <StatCard label="Расход" value={formatMoney(summary.expense)} hint={hasChildren ? "с учётом подпроектов" : undefined} />
        <StatCard label="Прибыль" value={formatMoney(summary.profit)} />
        <StatCard label="Часы" value={`${summary.hours} ч`} hint={hasChildren ? "с учётом подпроектов" : undefined} />
      </div>

      {hasChildren && (
        <Card title="Подпроекты (их деньги и часы включены выше)">
          <div className="flex flex-col gap-1">
            {project.children!.map((sp) => (
              <Link key={sp.id} to={`/projects/${sp.id}`} className="text-sm hover:underline">
                ↳ {sp.name}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card title="Последние операции">
        <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Дата</th>
              <th className="py-2">Тип</th>
              <th className="hidden py-2 sm:table-cell">Категория</th>
              <th className="py-2">Сумма</th>
              <th className="hidden py-2 md:table-cell">Описание</th>
            </tr>
          </thead>
          <tbody>
            {operations.map((o) => (
              <tr key={o.id} className="border-b border-slate-100">
                <td className="py-2">{formatDate(o.accrualDate)}</td>
                <td className="py-2">{o.type === "INCOME" ? "Доход" : "Расход"}</td>
                <td className="hidden py-2 sm:table-cell">{o.categoryValue?.name ?? "—"}</td>
                <td className={`py-2 font-medium ${o.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>
                  {o.type === "INCOME" ? "+" : "-"}{formatMoney(o.amount)}
                </td>
                <td className="hidden py-2 text-slate-500 md:table-cell">{o.description ?? "—"}</td>
              </tr>
            ))}
            {operations.length === 0 && (
              <tr><td colSpan={5} className="py-3 text-center text-slate-400">Операций пока нет</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      <Card title="Заявки клиента по проекту">
        <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Заявка</th>
              <th className="py-2">Статус</th>
              <th className="hidden py-2 sm:table-cell">Приоритет</th>
              <th className="py-2">Часы</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2">{r.title}</td>
                <td className="py-2">{r.status}</td>
                <td className="hidden py-2 sm:table-cell">{r.priority}</td>
                <td className="py-2">{r.totalHours ?? 0} ч</td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan={4} className="py-3 text-center text-slate-400">Заявок пока нет</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
