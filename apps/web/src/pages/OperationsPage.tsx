import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { DictionaryType, Operation, Project } from "../api/types";
import { Card } from "../components/Card";
import { formatMoney, formatDate, toDateInputValue } from "../utils/format";

const emptyForm = {
  type: "INCOME" as "INCOME" | "EXPENSE",
  projectId: "",
  amount: "",
  accrualDate: new Date().toISOString().slice(0, 10),
  paymentDate: new Date().toISOString().slice(0, 10),
  categoryValueId: "",
  description: "",
  vendorSharePercent: "0",
  taxable: true,
};

export function OperationsPage() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<DictionaryType | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api.get("/operations", { params: { pageSize: 100 } }).then((res) => setOperations(res.data.items));
  }

  useEffect(() => {
    load();
    api.get<Project[]>("/projects").then((res) => {
      const all = res.data.flatMap((p) => [p, ...(p.children ?? [])]);
      setProjects(all);
    });
    api.get<DictionaryType[]>("/dictionaries").then((res) => {
      setCategories(res.data.find((d) => d.code === "operation_category") ?? null);
    });
  }, []);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(o: Operation) {
    setForm({
      type: o.type,
      projectId: o.projectId ?? "",
      amount: String(o.amount),
      accrualDate: toDateInputValue(o.accrualDate),
      paymentDate: toDateInputValue(o.paymentDate),
      categoryValueId: o.categoryValueId ?? "",
      description: o.description ?? "",
      vendorSharePercent: String(o.vendorSharePercent ?? 0),
      taxable: o.taxable ?? true,
    });
    setEditingId(o.id);
    setShowForm(true);
  }

  function cancel() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      type: form.type,
      projectId: form.projectId || undefined,
      amount: Number(form.amount),
      accrualDate: new Date(form.accrualDate).toISOString(),
      paymentDate: form.paymentDate ? new Date(form.paymentDate).toISOString() : undefined,
      categoryValueId: form.categoryValueId || undefined,
      description: form.description || undefined,
      vendorSharePercent: form.type === "INCOME" ? Number(form.vendorSharePercent) : undefined,
      taxable: form.type === "INCOME" ? form.taxable : undefined,
    };
    if (editingId) {
      await api.patch(`/operations/${editingId}`, payload);
    } else {
      await api.post("/operations", payload);
    }
    cancel();
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Операции (доходы / расходы)</h1>
        <button onClick={() => (showForm ? cancel() : startCreate())} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Отмена" : "+ Новая операция"}
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
              <option value="INCOME">Доход</option>
              <option value="EXPENSE">Расход</option>
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">Без проекта (общая операция компании)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.categoryValueId} onChange={(e) => setForm({ ...form, categoryValueId: e.target.value })}>
              <option value="">Категория…</option>
              {categories?.values.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <input type="number" step="0.01" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Сумма" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Дата начисления (для PnL)</label>
              <input type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.accrualDate} onChange={(e) => setForm({ ...form, accrualDate: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Дата оплаты (для ДДС)</label>
              <input type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
            </div>
            {form.type === "INCOME" && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Доля вендора, % (0 для услуг)</label>
                  <input type="number" min="0" max="100" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.vendorSharePercent} onChange={(e) => setForm({ ...form, vendorSharePercent: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.taxable} onChange={(e) => setForm({ ...form, taxable: e.target.checked })} />
                  Облагается налогом (снять для оплаты на карту)
                </label>
              </>
            )}
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-3" placeholder="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
              <th className="hidden py-2 sm:table-cell">Проект</th>
              <th className="hidden py-2 md:table-cell">Категория</th>
              <th className="py-2">Тип</th>
              <th className="py-2">Сумма</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {operations.map((o) => (
              <tr key={o.id} className="border-b border-slate-100">
                <td className="py-2">{formatDate(o.accrualDate)}</td>
                <td className="hidden py-2 sm:table-cell">{o.project?.name ?? "Компания"}</td>
                <td className="hidden py-2 md:table-cell">{o.categoryValue?.name ?? "—"}</td>
                <td className="py-2">{o.type === "INCOME" ? "Доход" : "Расход"}</td>
                <td className={`py-2 font-medium ${o.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>
                  {o.type === "INCOME" ? "+" : "-"}{formatMoney(o.amount)}
                </td>
                <td className="py-2">
                  <button onClick={() => startEdit(o)} className="text-xs font-medium text-slate-600 hover:underline">
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
