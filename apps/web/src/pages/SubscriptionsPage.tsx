import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Client, LicenseProduct, Project, Subscription, SubscriptionMonthSummary } from "../api/types";
import { Card, StatCard } from "../components/Card";
import { formatMoney, formatDate, toDateInputValue } from "../utils/format";

const statusLabel: Record<Subscription["status"], string> = {
  ACTIVE: "Активна",
  PAUSED: "Приостановлена",
  CANCELLED: "Отменена",
};

export function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [monthSummary, setMonthSummary] = useState<SubscriptionMonthSummary | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<LicenseProduct[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);

  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [licenseProductId, setLicenseProductId] = useState("");
  const [price, setPrice] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [vendorSharePercent, setVendorSharePercent] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [nextBillingDate, setNextBillingDate] = useState("");
  const [status, setStatus] = useState<Subscription["status"]>("ACTIVE");

  function load() {
    api.get<Subscription[]>("/subscriptions").then((res) => setSubscriptions(res.data));
    api.get<SubscriptionMonthSummary>("/subscriptions/month-summary").then((res) => setMonthSummary(res.data));
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

  function startCreate() {
    setClientId("");
    setProjectId("");
    setLicenseProductId("");
    setPrice("");
    setDurationMonths("");
    setVendorSharePercent("");
    setTaxable(true);
    setStartDate(new Date().toISOString().slice(0, 10));
    setEditingId(null);
    setEditingSubscription(null);
    setShowForm(true);
  }

  function startEdit(s: Subscription) {
    setPrice(String(s.price));
    setDurationMonths(String(s.durationMonths));
    setVendorSharePercent(String(s.vendorSharePercent));
    setTaxable(s.taxable);
    setNextBillingDate(toDateInputValue(s.nextBillingDate));
    setStatus(s.status);
    setEditingId(s.id);
    setEditingSubscription(s);
    setShowForm(true);
  }

  function cancel() {
    setShowForm(false);
    setEditingId(null);
    setEditingSubscription(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (editingId) {
      await api.patch(`/subscriptions/${editingId}`, {
        price: Number(price),
        durationMonths: Number(durationMonths),
        vendorSharePercent: Number(vendorSharePercent),
        taxable,
        nextBillingDate: new Date(nextBillingDate).toISOString(),
        status,
      });
    } else {
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
    }
    cancel();
    load();
  }

  async function handleBill(s: Subscription) {
    const input = window.prompt(
      `Сумма продления «${s.licenseProduct?.name}» для клиента «${s.client?.name}». Если изменить — новая сумма закрепится и для следующих продлений.`,
      String(s.price)
    );
    if (input === null) return;
    const amount = Number(input.replace(",", "."));
    if (!amount || amount <= 0) {
      alert("Некорректная сумма");
      return;
    }
    setBusyId(s.id);
    try {
      await api.post(`/subscriptions/${s.id}/bill`, { amount });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleStatusChange(id: string, status: Subscription["status"]) {
    await api.patch(`/subscriptions/${id}`, { status });
    load();
  }

  async function handleDelete(s: Subscription) {
    if (!confirm(`Удалить подписку «${s.licenseProduct?.name}» клиента «${s.client?.name}»? Уже выставленные платежи (операции) сохранятся.`)) return;
    try {
      await api.delete(`/subscriptions/${s.id}`);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? "Не удалось удалить подписку");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Подписки на лицензии</h1>
        <button onClick={() => (showForm ? cancel() : startCreate())} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Отмена" : "+ Новая подписка"}
        </button>
      </div>

      <p className="text-sm text-slate-500">
        Продажа лицензии клиенту с автоматическим расчётом: сумма от клиента → доля вендора списывается
        расходом → с остатка откладывается резерв на налог → остальное свободно. Когда наступает
        следующий период — жмите «Продлить»: система предложит подтвердить сумму (можно изменить, если
        цена выросла или упала — новая сумма закрепится и для следующих продлений) и создаст операции
        за новый период одной кнопкой, без повторного заполнения формы.
      </p>

      {monthSummary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Общая сумма подписок в этом месяце"
            value={formatMoney(monthSummary.totalExpected)}
            hint="уже продлено + ожидается до конца месяца"
          />
          <StatCard
            label="Уже продлено в этом месяце"
            value={formatMoney(monthSummary.renewedAmount)}
          />
          <StatCard
            label="Чистая прибыль с продлённых"
            value={formatMoney(monthSummary.renewedNetProfit)}
            hint="доход минус доля вендора и налоговый резерв, уже по факту"
          />
          <StatCard
            label="Ожидаемая прибыль до конца месяца"
            value={formatMoney(monthSummary.projectedNetProfit)}
            hint="факт + прогноз по неоплаченным подпискам, за вычетом вендора и налога"
          />
        </div>
      )}

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {editingId ? (
              <div className="text-sm text-slate-500 sm:col-span-3">
                {editingSubscription?.client?.name} · {editingSubscription?.licenseProduct?.name}
                <span className="ml-1 text-xs text-slate-400">(клиента и продукт нельзя изменить — создайте новую подписку)</span>
              </div>
            ) : (
              <>
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
              </>
            )}
            <input type="number" step="0.01" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Цена" value={price} onChange={(e) => setPrice(e.target.value)} required />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Срок, мес.</label>
              <input type="number" min="1" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} required />
            </div>
            {editingId ? (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Следующий платёж</label>
                  <input type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={nextBillingDate} onChange={(e) => setNextBillingDate(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Статус</label>
                  <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as Subscription["status"])}>
                    <option value="ACTIVE">{statusLabel.ACTIVE}</option>
                    <option value="PAUSED">{statusLabel.PAUSED}</option>
                    <option value="CANCELLED">{statusLabel.CANCELLED}</option>
                  </select>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Дата начала</label>
                <input type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Доля вендора, %</label>
              <input type="number" min="0" max="100" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={vendorSharePercent} onChange={(e) => setVendorSharePercent(e.target.value)} required />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
              Облагается налогом
            </label>
            {!editingId && selectedProduct && (
              <div className="text-xs text-slate-400 sm:col-span-3">
                По умолчанию у продукта: {formatMoney(selectedProduct.defaultPrice)}, {selectedProduct.defaultDurationMonths} мес., вендору {selectedProduct.defaultVendorSharePercent}%
              </div>
            )}
            <button type="submit" className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:col-span-3">
              {editingId ? "Сохранить изменения" : "Создать и выставить первый платёж"}
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
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => handleBill(s)}
                        disabled={busyId === s.id || s.status !== "ACTIVE"}
                        className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        {busyId === s.id ? "…" : "Продлить"}
                      </button>
                      <button onClick={() => startEdit(s)} className="text-xs font-medium text-slate-600 hover:underline">
                        Редактировать
                      </button>
                      <button onClick={() => handleDelete(s)} className="text-xs font-medium text-red-600 hover:underline">
                        Удалить
                      </button>
                    </div>
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
