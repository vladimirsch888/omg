import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Project, RequestTicket, TimeEntry } from "../api/types";
import { Card } from "../components/Card";
import { formatDate } from "../utils/format";

export function TimeTrackingPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<RequestTicket[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [projectId, setProjectId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");

  function load() {
    api.get<TimeEntry[]>("/time-entries").then((res) => setEntries(res.data));
  }

  useEffect(() => {
    load();
    api.get<Project[]>("/projects").then((res) => setProjects(res.data.flatMap((p) => [p, ...(p.children ?? [])])));
    api.get<RequestTicket[]>("/requests").then((res) => setRequests(res.data));
  }, []);

  const requestsForProject = requests.filter((r) => r.projectId === projectId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post("/time-entries", {
      projectId,
      requestId: requestId || undefined,
      date: new Date(date).toISOString(),
      hours: Number(hours),
      description: description || undefined,
    });
    setHours("");
    setDescription("");
    setShowForm(false);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Учёт часов по заявкам</h1>
        <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Отмена" : "+ Записать время"}
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={projectId} onChange={(e) => { setProjectId(e.target.value); setRequestId(""); }} required>
              <option value="">Проект…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={requestId} onChange={(e) => setRequestId(e.target.value)} disabled={!projectId}>
              <option value="">Без привязки к заявке</option>
              {requestsForProject.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
            <input type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} required />
            <input type="number" step="0.25" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Часы" value={hours} onChange={(e) => setHours(e.target.value)} required />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" placeholder="Описание работ" value={description} onChange={(e) => setDescription(e.target.value)} />
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
              <th className="py-2">Дата</th>
              <th className="py-2">Проект</th>
              <th className="hidden py-2 sm:table-cell">Заявка</th>
              <th className="hidden py-2 md:table-cell">Сотрудник</th>
              <th className="py-2">Часы</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-slate-100">
                <td className="py-2">{formatDate(e.date)}</td>
                <td className="py-2">{e.project?.name}</td>
                <td className="hidden py-2 sm:table-cell">{e.request?.title ?? "—"}</td>
                <td className="hidden py-2 md:table-cell">{e.user?.name}</td>
                <td className="py-2 font-medium">{e.hours} ч</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
