import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { DictionaryType, LicenseProduct } from "../api/types";
import { Card } from "../components/Card";
import { formatMoney } from "../utils/format";

export function ProductsPage() {
  const [products, setProducts] = useState<LicenseProduct[]>([]);
  const [categories, setCategories] = useState<DictionaryType | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [categoryValueId, setCategoryValueId] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [defaultDurationMonths, setDefaultDurationMonths] = useState("1");
  const [defaultVendorSharePercent, setDefaultVendorSharePercent] = useState("50");
  const [defaultTaxable, setDefaultTaxable] = useState(true);

  function load() {
    api.get<LicenseProduct[]>("/license-products", { params: { includeInactive: true } }).then((res) => setProducts(res.data));
  }

  useEffect(() => {
    load();
    api.get<DictionaryType[]>("/dictionaries").then((res) => {
      setCategories(res.data.find((d) => d.code === "operation_category") ?? null);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post("/license-products", {
      name,
      categoryValueId: categoryValueId || undefined,
      defaultPrice: Number(defaultPrice),
      defaultDurationMonths: Number(defaultDurationMonths),
      defaultVendorSharePercent: Number(defaultVendorSharePercent),
      defaultTaxable,
    });
    setName("");
    setDefaultPrice("");
    setShowForm(false);
    load();
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api.patch(`/license-products/${id}`, { isActive: !isActive });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Продукты (лицензии)</h1>
        <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Отмена" : "+ Новый продукт"}
        </button>
      </div>

      <p className="text-sm text-slate-500">
        Товарная матрица лицензий, которые вы продаёте: цена, срок подписки, доля вендора и облагается
        ли платёж налогом. Используется при создании подписки клиенту — не нужно каждый раз вводить
        эти параметры вручную.
      </p>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" placeholder="Название (например amoCRM Professional, 10 мест)" value={name} onChange={(e) => setName(e.target.value)} required />
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={categoryValueId} onChange={(e) => setCategoryValueId(e.target.value)}>
              <option value="">Категория операций…</option>
              {categories?.values.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <input type="number" step="0.01" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Цена по умолчанию" value={defaultPrice} onChange={(e) => setDefaultPrice(e.target.value)} required />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Срок подписки, мес.</label>
              <input type="number" min="1" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={defaultDurationMonths} onChange={(e) => setDefaultDurationMonths(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Доля вендора, %</label>
              <input type="number" min="0" max="100" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={defaultVendorSharePercent} onChange={(e) => setDefaultVendorSharePercent(e.target.value)} required />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={defaultTaxable} onChange={(e) => setDefaultTaxable(e.target.checked)} />
              Облагается налогом (не оплата на карту)
            </label>
            <button type="submit" className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:col-span-3">
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
                <th className="py-2">Название</th>
                <th className="hidden py-2 sm:table-cell">Категория</th>
                <th className="py-2">Цена</th>
                <th className="hidden py-2 md:table-cell">Срок</th>
                <th className="hidden py-2 md:table-cell">Вендору, %</th>
                <th className="py-2">Активен</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2">{p.name}</td>
                  <td className="hidden py-2 sm:table-cell">{p.categoryValue?.name ?? "—"}</td>
                  <td className="py-2">{formatMoney(p.defaultPrice)}</td>
                  <td className="hidden py-2 md:table-cell">{p.defaultDurationMonths} мес.</td>
                  <td className="hidden py-2 md:table-cell">{p.defaultVendorSharePercent}%</td>
                  <td className="py-2">
                    <button onClick={() => toggleActive(p.id, p.isActive)} className={`rounded px-2 py-1 text-xs ${p.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {p.isActive ? "Да" : "Нет"}
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={6} className="py-3 text-center text-slate-400">Продуктов пока нет</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
