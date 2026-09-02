import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Client, LicenseProduct, Project, Subscription } from "../api/types";
import { Card } from "../components/Card";
import { formatMoney, formatDate } from "../utils/format";

const statusLabel: Record<Subscription["status"], string> = {
  ACTIVE: "Активна",
  PAUSED: "Приостановлена",
  CANCELLED: "Отменена",
};

export function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<LicenseProduct[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [licenseProductId, setLicenseProductId] = useState("");
  const [price, setPrice] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [vendorSharePercent, setVendorSharePercent] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  function load() {
    api.get<Subscription[]>("/subscriptions").then((res) => setSubscriptions(res.data));
  }

  useEffect(() => {
    load();
    api.get<Client[]>("/clients").then((res) => setClients(res.data));
    // WORK products have no subscription term — only LICENSE products can be subscribed.
    api.get<LicenseProduct[]>("/license-products").then((res) => setProducts(res.data.filter((p) => p.type === "LICENSE")));
    api.get<Project[]>("/projects").then((res) => setProjects(res.data.flatMap((p) => [p, ...(p.children ?? [])])));
  }, []);

  const projectsForClient = projects.filter((p) => p.clientId === clientId);
  const selectedProduct = products.find((p) => p.id === licenseProductId);

  function onSelectProduct(id: string) {
    setLicenseProductId(id);
    const product = products.find((p) => p.id === id);
    if (product) {
      setPrice(String(product.defaultPrice));
      setDurationMonths(String(product.defaultDurationMonths));
      setVendorSharePercent(String(product.defaultVendorSharePercent));
      setTaxable(product.defaultTaxable);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post("/subscriptions", {
      clientId,
      projectId: projectId || undefined,
      licenseProductId,
      price: price ? Number(price) : undefined,
      durationMonths: durationMonths ? Number(durationMonths) : undefined,
      vendorSharePercent: vendorSharePercent ? Number(vendorSharePercent) : undefined,
      taxable,
      startDate: new Date(startDate).toISOString(),
    });
    setClientId("");
    setProjectId("");
    setLicenseProductId("");
    setPrice("");
    setShowForm(false);
    load();
  }

  async function handleBill(id: string) {
    setBusyId(id);
    try {
      await api.post(`/subscriptions/${id}/bill`);
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleStatusChange(id: string, status: Subscription["status"]) {
    await api.patch(`/subscriptions/${id}`, { status });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Подписки на лицензии</h1>
        <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Отмена" : "+ Новая подписка"}
        </button>
      </div>

      <p className="text-sm text-slate-500">
        Продажа лицензии клиенту с автоматическим расчётом: сумма от клиента → доля вендора списывается
        расходом → с остатка откладывается резерв на налог → остальное свободно. Когда наступает
        следующий период — жмите «Выставить следующий платёж», это создаст операции за новый месяц
        одной кнопкой, без повторного заполнения формы.
      </p>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(""); }} required>
              <option value="">Клиент…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!clientId}>
              <option value="">Без привязки к проекту</option>
              {projectsForClient.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={licenseProductId} onChange={(e) => onSelectProduct(e.target.value)} required>
              <option value="">Продукт…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" step="0.01" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Цена" value={price} onChange={(e) => setPrice(e.target.value)} required />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Срок, мес.</label>
              <input type="number" min="1" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Дата начала</label>
              <input type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Доля вендора, %</label>
              <input type="number" min="0" max="100" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={vendorSharePercent} onChange={(e) => setVendorSharePercent(e.target.value)} required />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
              Облагается налогом
            </label>
            {selectedProduct && (
              <div className="text-xs text-slate-400 sm:col-span-3">
                По умолчанию у продукта: {formatMoney(selectedProduct.defaultPrice)}, {selectedProduct.defaultDurationMonths} мес., вендору {selectedProduct.defaultVendorSharePercent}%
              </div>
            )}
            <button type="submit" className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:col-span-3">
              Создать и выставить первый платёж
            </button>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">Клиент</th>
                <th className="py-2">Продукт</th>
                <th className="py-2">Цена</th>
                <th className="hidden py-2 sm:table-cell">Срок</th>
                <th className="py-2">Следующий платёж</th>
                <th className="hidden py-2 md:table-cell">Статус</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2">{s.client?.name}</td>
                  <td className="py-2">
                    {s.licenseProduct?.name}
                    {!s.taxable && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">на карту</span>}
                  </td>
                  <td className="py-2">{formatMoney(s.price)}</td>
                  <td className="hidden py-2 sm:table-cell">{s.durationMonths} мес.</td>
                  <td className="py-2">{formatDate(s.nextBillingDate)}</td>
                  <td className="hidden py-2 md:table-cell">
                    <select
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      value={s.status}
                      onChange={(e) => handleStatusChange(s.id, e.target.value as Subscription["status"])}
                    >
                      <option value="ACTIVE">{statusLabel.ACTIVE}</option>
                      <option value="PAUSED">{statusLabel.PAUSED}</option>
                      <option value="CANCELLED">{statusLabel.CANCELLED}</option>
                    </select>
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => handleBill(s.id)}
                      disabled={busyId === s.id || s.status !== "ACTIVE"}
                      className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                    >
                      {busyId === s.id ? "…" : "Выставить платёж"}
                    </button>
                  </td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr><td colSpan={7} className="py-3 text-center text-slate-400">Подписок пока нет</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
