import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Client, LicenseProduct, Project, Sale } from "../api/types";
import { Card } from "../components/Card";
import { formatMoney, formatDate } from "../utils/format";

const emptyForm = {
  clientId: "",
  projectId: "",
  licenseProductId: "",
  amount: "",
  saleDate: new Date().toISOString().slice(0, 10),
  workEndDate: "",
};

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<LicenseProduct[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api.get<Sale[]>("/sales").then((res) => setSales(res.data));
  }

  useEffect(() => {
    load();
    api.get<Client[]>("/clients").then((res) => setClients(res.data));
    api.get<LicenseProduct[]>("/license-products").then((res) => setProducts(res.data));
    api.get<Project[]>("/projects").then((res) => setProjects(res.data.flatMap((p) => [p, ...(p.children ?? [])])));
  }, []);

  const projectsForClient = projects.filter((p) => p.clientId === form.clientId);
  const selectedProduct = products.find((p) => p.id === form.licenseProductId);

  function onSelectClient(clientId: string) {
    setForm({ ...form, clientId, projectId: "" });
  }

  function onSelectProduct(licenseProductId: string) {
    const product = products.find((p) => p.id === licenseProductId);
    setForm({ ...form, licenseProductId, amount: product ? String(product.defaultPrice) : form.amount });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post("/sales", {
      clientId: form.clientId,
      projectId: form.projectId || undefined,
      licenseProductId: form.licenseProductId,
      amount: Number(form.amount),
      saleDate: new Date(form.saleDate).toISOString(),
      workEndDate: selectedProduct?.type === "WORK" && form.workEndDate ? new Date(form.workEndDate).toISOString() : undefined,
    });
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  async function handleDelete(sale: Sale) {
    if (!confirm(`Удалить продажу «${sale.licenseProduct?.name}» клиенту «${sale.client?.name}»?`)) return;
    try {
      await api.delete(`/sales/${sale.id}`);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? "Не удалось удалить продажу");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Продажи</h1>
        <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Отмена" : "+ Новая продажа"}
        </button>
      </div>

      <p className="text-sm text-slate-500">
        Разовая продажа продукта клиенту: доля вендора и налоговый резерв считаются автоматически по
        умолчаниям продукта. Для лицензий с периодическим продлением используйте раздел «Подписки» —
        там есть кнопка «Выставить следующий платёж» на каждый новый период.
      </p>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.clientId} onChange={(e) => onSelectClient(e.target.value)} required>
              <option value="">Клиент…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} disabled={!form.clientId}>
              <option value="">Без привязки к проекту</option>
              {projectsForClient.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.licenseProductId} onChange={(e) => onSelectProduct(e.target.value)} required>
              <option value="">Продукт…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" step="0.01" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Сумма продажи" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Дата продажи</label>
              <input type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.saleDate} onChange={(e) => setForm({ ...form, saleDate: e.target.value })} required />
            </div>
            {selectedProduct?.type === "WORK" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Дата окончания работ</label>
                <input type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.workEndDate} onChange={(e) => setForm({ ...form, workEndDate: e.target.value })} required />
              </div>
            )}
            {selectedProduct && (
              <div className="flex items-center text-xs text-slate-400 sm:col-span-1">
                Вендору {selectedProduct.defaultVendorSharePercent}%{!selectedProduct.defaultTaxable && ", без налогового резерва (на карту)"}
              </div>
            )}
            <button type="submit" className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:col-span-3">
              Провести продажу
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
                <th className="py-2">Клиент</th>
                <th className="hidden py-2 sm:table-cell">Проект</th>
                <th className="py-2">Продукт</th>
                <th className="py-2">Сумма</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2">{formatDate(s.saleDate)}</td>
                  <td className="py-2">{s.client?.name}</td>
                  <td className="hidden py-2 sm:table-cell">{s.project?.name ?? "—"}</td>
                  <td className="py-2">
                    {s.licenseProduct?.name}
                    {!s.taxable && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">на карту</span>}
                    {s.workEndDate && <div className="text-xs text-slate-400">работы до {formatDate(s.workEndDate)}</div>}
                  </td>
                  <td className="py-2 font-medium text-green-600">{formatMoney(s.amount)}</td>
                  <td className="py-2">
                    <button onClick={() => handleDelete(s)} className="text-xs font-medium text-red-600 hover:underline">
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr><td colSpan={6} className="py-3 text-center text-slate-400">Продаж пока нет</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
