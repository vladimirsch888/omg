import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Project, RequestTicket } from "../api/types";
import { Card } from "../components/Card";

export function RequestsPage() {
  const [requests, setRequests] = useState<RequestTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");

  function load() {
    api.get<RequestTicket[]>("/requests").then((res) => setRequests(res.data));
  }

  useEffect(() => {
    load();
    api.get<Project[]>("/projects").then((res) => setProjects(res.data.flatMap((p) => [p, ...(p.children ?? [])])));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post("/requests", { projectId, title, priority });
    setTitle("");
    setShowForm(false);
    load();
  }

  async function updateStatus(id: string, status: RequestTicket["status"]) {
    await api.patch(`/requests/${id}`, { status });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Заявки клиентов</h1>
        <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Отмена" : "+ Новая заявка"}
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
              <option value="">Проект…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Название заявки" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
              <option value="LOW">Низкий приоритет</option>
              <option value="MEDIUM">Средний приоритет</option>
              <option value="HIGH">Высокий приоритет</option>
            </select>
            <button type="submit" className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Сохранить
            </button>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Заявка</th>
              <th className="hidden py-2 sm:table-cell">Проект</th>
              <th className="hidden py-2 md:table-cell">Приоритет</th>
              <th className="py-2">Часы</th>
              <th className="py-2">Статус</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2">{r.title}</td>
                <td className="hidden py-2 sm:table-cell">{r.project?.id ? projects.find((p) => p.id === r.project?.id)?.name : "—"}</td>
                <td className="hidden py-2 md:table-cell">{r.priority}</td>
                <td className="py-2">{r.totalHours ?? 0} ч</td>
                <td className="py-2">
                  <select
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    value={r.status}
                    onChange={(e) => updateStatus(r.id, e.target.value as RequestTicket["status"])}
                  >
                    <option value="OPEN">Открыта</option>
                    <option value="IN_PROGRESS">В работе</option>
                    <option value="DONE">Выполнена</option>
                    <option value="CANCELLED">Отменена</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
