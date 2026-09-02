import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Client, DictionaryType, Project } from "../api/types";
import { Card } from "../components/Card";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projectTypes, setProjectTypes] = useState<DictionaryType | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [parentId, setParentId] = useState("");
  const [typeValueId, setTypeValueId] = useState("");

  function load() {
    api.get<Project[]>("/projects").then((res) => setProjects(res.data));
  }

  useEffect(() => {
    load();
    api.get<Client[]>("/clients").then((res) => setClients(res.data));
    api.get<DictionaryType[]>("/dictionaries").then((res) => {
      setProjectTypes(res.data.find((d) => d.code === "project_type") ?? null);
    });
  }, []);

  const topLevelProjectsForClient = projects.filter((p) => p.clientId === clientId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post("/projects", {
      name,
      clientId,
      parentId: parentId || undefined,
      typeValueId: typeValueId || undefined,
    });
    setName("");
    setParentId("");
    setTypeValueId("");
    setShowForm(false);
    load();
  }

  async function handleDelete(p: Project) {
    const warning = p.children && p.children.length > 0
      ? `Удалить проект «${p.name}» вместе со всеми подпроектами (${p.children.length}), их заявками и часами?`
      : `Удалить проект «${p.name}»? Его заявки и часы также будут удалены.`;
    if (!confirm(warning)) return;
    try {
      await api.delete(`/projects/${p.id}`);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? "Не удалось удалить проект");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Проекты</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {showForm ? "Отмена" : "+ Новый проект / подпроект"}
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={clientId} onChange={(e) => { setClientId(e.target.value); setParentId(""); }} required>
              <option value="">Клиент…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={!clientId}>
              <option value="">Без родителя (проект верхнего уровня)</option>
              {topLevelProjectsForClient.map((p) => (
                <option key={p.id} value={p.id}>Подпроект в «{p.name}»</option>
              ))}
            </select>
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} required />
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={typeValueId} onChange={(e) => setTypeValueId(e.target.value)}>
              <option value="">Тип проекта…</option>
              {projectTypes?.values.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <button type="submit" className="col-span-full w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Сохранить
            </button>
          </form>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-3">
          {projects.map((p) => (
            <div key={p.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <Link to={`/projects/${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{p.client?.name} · {p.status}</span>
                  <button onClick={() => handleDelete(p)} className="text-xs font-medium text-red-600 hover:underline">
                    Удалить
                  </button>
                </div>
              </div>
              {p.children && p.children.length > 0 && (
                <div className="mt-2 ml-4 flex flex-col gap-1 border-l border-slate-200 pl-3">
                  {p.children.map((sp) => (
                    <div key={sp.id} className="flex items-center justify-between">
                      <Link to={`/projects/${sp.id}`} className="text-sm text-slate-600 hover:underline">
                        ↳ {sp.name}
                      </Link>
                      <button onClick={() => handleDelete(sp)} className="text-xs font-medium text-red-600 hover:underline">
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
