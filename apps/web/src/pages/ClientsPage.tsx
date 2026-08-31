import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Client } from "../api/types";
import { Card } from "../components/Card";

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  function load() {
    api.get<Client[]>("/clients").then((res) => setClients(res.data));
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post("/clients", { name, inn: inn || undefined, contactPerson: contactPerson || undefined, contactEmail: contactEmail || undefined });
    setName("");
    setInn("");
    setContactPerson("");
    setContactEmail("");
    setShowForm(false);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Клиенты (B2B)</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {showForm ? "Отмена" : "+ Новый клиент"}
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Название компании" value={name} onChange={(e) => setName(e.target.value)} required />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="ИНН" value={inn} onChange={(e) => setInn(e.target.value)} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Контактное лицо" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            <button type="submit" className="col-span-full w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Сохранить
            </button>
          </form>
        </Card>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Название</th>
              <th className="py-2">ИНН</th>
              <th className="py-2">Контакт</th>
              <th className="py-2">Статус</th>
              <th className="py-2">Проектов</th>
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
                <td className="py-2">{c.inn ?? "—"}</td>
                <td className="py-2">{c.contactPerson ?? "—"}</td>
                <td className="py-2">{c.status}</td>
                <td className="py-2">{c.projectsCount ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
