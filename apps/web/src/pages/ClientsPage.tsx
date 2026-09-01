import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Client } from "../api/types";
import { Card } from "../components/Card";

const emptyForm = {
  name: "",
  legalName: "",
  inn: "",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
  status: "ACTIVE" as Client["status"],
  notes: "",
};

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api.get<Client[]>("/clients").then((res) => setClients(res.data));
  }

  useEffect(load, []);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(c: Client) {
    setForm({
      name: c.name,
      legalName: c.legalName ?? "",
      inn: c.inn ?? "",
      contactPerson: c.contactPerson ?? "",
      contactEmail: c.contactEmail ?? "",
      contactPhone: c.contactPhone ?? "",
      status: c.status,
      notes: c.notes ?? "",
    });
    setEditingId(c.id);
    setShowForm(true);
  }

  function cancel() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      legalName: form.legalName || undefined,
      inn: form.inn || undefined,
      contactPerson: form.contactPerson || undefined,
      contactEmail: form.contactEmail || undefined,
      contactPhone: form.contactPhone || undefined,
      status: form.status,
      notes: form.notes || undefined,
    };
    if (editingId) {
      await api.patch(`/clients/${editingId}`, payload);
    } else {
      await api.post("/clients", payload);
    }
    cancel();
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Клиенты (B2B)</h1>
        <button
          onClick={() => (showForm ? cancel() : startCreate())}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {showForm ? "Отмена" : "+ Новый клиент"}
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Название компании" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Юридическое название" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="ИНН" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} />
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Client["status"] })}>
              <option value="ACTIVE">Активен</option>
              <option value="PAUSED">Приостановлен</option>
              <option value="CHURNED">Ушёл</option>
            </select>
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Контактное лицо" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Телефон" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" placeholder="Заметки" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button type="submit" className="col-span-full w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
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
              <th className="py-2">Название</th>
              <th className="hidden py-2 sm:table-cell">ИНН</th>
              <th className="hidden py-2 md:table-cell">Контакт</th>
              <th className="py-2">Статус</th>
              <th className="py-2">Проектов</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2">
                  <Link to={`/clients/${c.id}`} className="font-medium text-slate-900 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="hidden py-2 sm:table-cell">{c.inn ?? "—"}</td>
                <td className="hidden py-2 md:table-cell">{c.contactPerson ?? "—"}</td>
                <td className="py-2">{c.status}</td>
                <td className="py-2">{c.projectsCount ?? 0}</td>
                <td className="py-2">
                  <button onClick={() => startEdit(c)} className="text-xs font-medium text-slate-600 hover:underline">
                    Редактировать
                  </button>
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
