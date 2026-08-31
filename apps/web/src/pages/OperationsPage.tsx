import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { DictionaryType, Operation, Project } from "../api/types";
import { Card } from "../components/Card";
import { formatMoney, formatDate } from "../utils/format";

export function OperationsPage() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<DictionaryType | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<DictionaryType | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [type, setType] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [accrualDate, setAccrualDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryValueId, setCategoryValueId] = useState("");
  const [description, setDescription] = useState("");

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
      setPaymentMethods(res.data.find((d) => d.code === "payment_method") ?? null);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post("/operations", {
      type,
      projectId: projectId || undefined,
      amount: Number(amount),
      accrualDate: new Date(accrualDate).toISOString(),
      paymentDate: paymentDate ? new Date(paymentDate).toISOString() : undefined,
      categoryValueId: categoryValueId || undefined,
      description: description || undefined,
    });
    setAmount("");
    setDescription("");
    setShowForm(false);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Операции (доходы / расходы)</h1>
        <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Отмена" : "+ Новая операция"}
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="INCOME">Доход</option>
              <option value="EXPENSE">Расход</option>
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Без проекта (общая операция компании)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={categoryValueId} onChange={(e) => setCategoryValueId(e.target.value)}>
              <option value="">Категория…</option>
              {categories?.values.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <input type="number" step="0.01" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Сумма" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Дата начисления (для PnL)</label>
              <input type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={accrualDate} onChange={(e) => setAccrualDate(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Дата оплаты (для ДДС)</label>
              <input type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-3" placeholder="Описание" value={description} onChange={(e) => setDescription(e.target.value)} />
            <button type="submit" className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Сохранить
            </button>
          </form>
        </Card>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Дата</th>
              <th className="py-2">Проект</th>
              <th className="py-2">Категория</th>
              <th className="py-2">Тип</th>
              <th className="py-2">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {operations.map((o) => (
              <tr key={o.id} className="border-b border-slate-100">
                <td className="py-2">{formatDate(o.accrualDate)}</td>
                <td className="py-2">{o.project?.name ?? "Компания"}</td>
                <td className="py-2">{o.categoryValue?.name ?? "—"}</td>
                <td className="py-2">{o.type === "INCOME" ? "Доход" : "Расход"}</td>
                <td className={`py-2 font-medium ${o.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>
                  {o.type === "INCOME" ? "+" : "-"}{formatMoney(o.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
