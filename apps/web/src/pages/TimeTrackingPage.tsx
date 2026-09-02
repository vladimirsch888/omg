import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Project, RequestTicket, TimeEntry } from "../api/types";
import { Card } from "../components/Card";
import { formatDate, toDateInputValue } from "../utils/format";

const emptyForm = {
  projectId: "",
  requestId: "",
  date: new Date().toISOString().slice(0, 10),
  hours: "",
  description: "",
};

export function TimeTrackingPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<RequestTicket[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api.get<TimeEntry[]>("/time-entries").then((res) => setEntries(res.data));
  }

  useEffect(() => {
    load();
    api.get<Project[]>("/projects").then((res) => setProjects(res.data.flatMap((p) => [p, ...(p.children ?? [])])));
    api.get<RequestTicket[]>("/requests").then((res) => setRequests(res.data));
  }, []);

  const requestsForProject = requests.filter((r) => r.projectId === form.projectId);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(e: TimeEntry) {
    setForm({
      projectId: e.projectId,
      requestId: e.requestId ?? "",
      date: toDateInputValue(e.date),
      hours: String(e.hours),
      description: e.description ?? "",
    });
    setEditingId(e.id);
    setShowForm(true);
  }

  function cancel() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      projectId: form.projectId,
      requestId: form.requestId || undefined,
      date: new Date(form.date).toISOString(),
      hours: Number(form.hours),
      description: form.description || undefined,
    };
    if (editingId) {
      await api.patch(`/time-entries/${editingId}`, payload);
    } else {
      await api.post("/time-entries", payload);
    }
    cancel();
    load();
  }

  async function handleDelete(entry: TimeEntry) {
    if (!confirm(`Удалить запись на ${entry.hours} ч?`)) return;
    try {
      await api.delete(`/time-entries/${entry.id}`);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? "Не удалось удалить запись");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Учёт часов по заявкам</h1>
        <button onClick={() => (showForm ? cancel() : startCreate())} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Отмена" : "+ Записать время"}
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value, requestId: "" })} required>
              <option value="">Проект…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.requestId} onChange={(e) => setForm({ ...form, requestId: e.target.value })} disabled={!form.projectId}>
              <option value="">Без привязки к заявке</option>
              {requestsForProject.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
            <input type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <input type="number" step="0.25" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Часы" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} required />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" placeholder="Описание работ" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <button type="submit" className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              {editingId ? "Сохранить изменения" : "Сохранить"}
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
              <th className="py-2"></th>
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
                <td className="py-2">
                  <div className="flex gap-3">
                    <button onClick={() => startEdit(e)} className="text-xs font-medium text-slate-600 hover:underline">
                      Редактировать
                    </button>
                    <button onClick={() => handleDelete(e)} className="text-xs font-medium text-red-600 hover:underline">
                      Удалить
                    </button>
                  </div>
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
