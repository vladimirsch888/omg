import { FormEvent, useEffect, useState } from "react";
import {
  CalendarClock,
  CreditCard,
  FileCheck2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  Undo2,
  Wallet,
} from "lucide-react";
import { api } from "../api/client";
import { Client, LicenseProduct, Project, Subscription, SubscriptionMonthSummary } from "../api/types";
import {
  Badge,
  Button,
  ListCard,
  Checkbox,
  Column,
  DataTable,
  EmptyState,
  Field,
  IconButton,
  Input,
  MetaItem,
  Modal,
  PageHeader,
  ReadonlyValue,
  RowCard,
  Select,
  SelectCompact,
  StatCard,
  StatusBadge,
  useUi,
  type BadgeTone,
} from "../components/ui";
import { formatDate, formatMoney, toDateInputValue } from "../utils/format";

const statusLabel: Record<Subscription["status"], string> = {
  ACTIVE: "Активна",
  PAUSED: "Приостановлена",
  CANCELLED: "Отменена",
};

const statusTone: Record<Subscription["status"], BadgeTone> = {
  ACTIVE: "income",
  PAUSED: "reserve",
  CANCELLED: "neutral",
};

/** Renewals due within a week are what the page is really for — flag them. */
function dueTone(nextBillingDate: string): BadgeTone {
  const days = (new Date(nextBillingDate).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "expense";
  if (days <= 7) return "reserve";
  return "neutral";
}

export function SubscriptionsPage() {
  const ui = useUi();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [monthSummary, setMonthSummary] = useState<SubscriptionMonthSummary | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<LicenseProduct[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
    setFormOpen(true);
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
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/subscriptions/${editingId}`, {
          price: Number(price),
          durationMonths: Number(durationMonths),
          vendorSharePercent: Number(vendorSharePercent),
          taxable,
          nextBillingDate: new Date(nextBillingDate).toISOString(),
          status,
        });
        ui.toast("Подписка обновлена", "success");
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
        ui.toast("Подписка создана, первый платёж выставлен", "success");
      }
      setFormOpen(false);
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось сохранить подписку", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleBill(s: Subscription) {
    const input = await ui.prompt({
      title: "Продлить подписку",
      message: `${s.licenseProduct?.name} — ${s.client?.name}`,
      label: "Сумма продления",
      type: "number",
      defaultValue: String(s.price),
      confirmLabel: "Продлить",
      hint: "Если сумма изменилась, новая цена закрепится и для следующих продлений.",
    });
    if (input === null) return;
    const amount = Number(input.replace(",", "."));
    if (!amount || amount <= 0) {
      ui.toast("Некорректная сумма", "error");
      return;
    }
    setBusyId(s.id);
    try {
      await api.post(`/subscriptions/${s.id}/bill`, { amount });
      ui.toast(`Продлено на ${formatMoney(amount)}`, "success");
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось продлить подписку", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleStatusChange(id: string, next: Subscription["status"]) {
    await api.patch(`/subscriptions/${id}`, { status: next });
    load();
  }

  /**
   * Marks (or un-marks) the "счёт отправлен" stage: the invoice for the next
   * period has gone out but the money hasn't arrived, so nothing is booked —
   * the row just gets flagged until "Продлить" closes the cycle.
   */
  async function handleInvoiceSent(s: Subscription) {
    const sent = Boolean(s.invoiceSentAt);
    setBusyId(s.id);
    try {
      if (sent) {
        await api.delete(`/subscriptions/${s.id}/invoice-sent`);
        ui.toast("Отметка о счёте снята", "success");
      } else {
        await api.post(`/subscriptions/${s.id}/invoice-sent`);
        ui.toast(`Счёт отправлен: ${s.client?.name}`, "success");
      }
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось изменить отметку о счёте", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(s: Subscription) {
    const confirmed = await ui.confirm({
      title: "Удалить подписку?",
      message: `${s.licenseProduct?.name} — ${s.client?.name}. Уже выставленные платежи сохранятся в операциях.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/subscriptions/${s.id}`);
      ui.toast("Подписка удалена", "success");
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось удалить подписку", "error");
    }
  }

  const renewedShare =
    monthSummary && monthSummary.totalExpected > 0
      ? Math.round((monthSummary.renewedAmount / monthSummary.totalExpected) * 100)
      : 0;

  const invoiceBadge = (s: Subscription) =>
    s.invoiceSentAt ? (
      <Badge tone="reserve">
        <FileCheck2 className="size-3" strokeWidth={1.9} />
        счёт от {formatDate(s.invoiceSentAt)}
      </Badge>
    ) : null;

  const columns: Column<Subscription>[] = [
    {
      key: "client",
      header: "Клиент",
      width: "22%",
      render: (s) => <span className="font-medium text-ink">{s.client?.name}</span>,
    },
    {
      key: "product",
      header: "Продукт",
      width: "26%",
      render: (s) => (
        <span className="flex items-center gap-1.5 text-ink-muted">
          {s.licenseProduct?.name}
          {!s.taxable && <Badge tone="reserve">на карту</Badge>}
        </span>
      ),
    },
    {
      key: "price",
      header: "Цена",
      align: "right",
      render: (s) => <span className="font-medium text-ink">{formatMoney(s.price)}</span>,
    },
    {
      key: "duration",
      header: "Срок",
      align: "right",
      hideBelow: "lg",
      render: (s) => <span className="text-ink-muted">{s.durationMonths} мес.</span>,
    },
    {
      key: "next",
      header: "Платёж",
      nowrap: true,
      render: (s) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={dueTone(s.nextBillingDate)}>
            <CalendarClock className="size-3" strokeWidth={1.9} />
            {formatDate(s.nextBillingDate)}
          </Badge>
          {invoiceBadge(s)}
        </div>
      ),
    },
    {
      key: "status",
      header: "Статус",
      hideBelow: "lg",
      // Without a width the select collapses to just its chevron once the
      // row carries the invoice action too.
      width: "14%",
      render: (s) => (
        <SelectCompact value={s.status} onChange={(e) => handleStatusChange(s.id, e.target.value as Subscription["status"])}>
          <option value="ACTIVE">{statusLabel.ACTIVE}</option>
          <option value="PAUSED">{statusLabel.PAUSED}</option>
          <option value="CANCELLED">{statusLabel.CANCELLED}</option>
        </SelectCompact>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            icon={s.invoiceSentAt ? Undo2 : FileCheck2}
            label={s.invoiceSentAt ? "Снять отметку о счёте" : "Счёт отправлен"}
            disabled={s.status !== "ACTIVE" || busyId === s.id}
            onClick={() => handleInvoiceSent(s)}
            className="hover:text-reserve"
          />
          <Button
            size="sm"
            variant="primary"
            icon={RefreshCw}
            loading={busyId === s.id}
            disabled={s.status !== "ACTIVE"}
            onClick={() => handleBill(s)}
          >
            Продлить
          </Button>
          <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(s)} />
          <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(s)} className="hover:text-expense" />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Подписки на лицензии"
        description="Сумма от клиента → доля вендора списывается расходом → с остатка откладывается резерв на налог → остальное свободно. Кнопка «Продлить» создаёт операции за новый период и подтверждает сумму."
        actions={
          <Button variant="primary" icon={Plus} onClick={startCreate}>
            Новая подписка
          </Button>
        }
      />

      {monthSummary && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard
            label="Общая сумма подписок в этом месяце"
            value={formatMoney(monthSummary.totalExpected)}
            icon={Wallet}
            wide
            chart={
              <div className="flex h-full flex-col justify-center gap-1.5">
                <div className="flex h-1.5 overflow-hidden rounded-full bg-raised">
                  <div className="bg-income" style={{ width: `${renewedShare}%` }} />
                  <div className="flex-1 bg-accent/35" />
                </div>
                <div className="flex justify-between text-[10px] text-ink-subtle">
                  <span>продлено {renewedShare}%</span>
                  <span>осталось {100 - renewedShare}%</span>
                </div>
              </div>
            }
          />
          <StatCard
            label="Уже продлено в этом месяце"
            value={formatMoney(monthSummary.renewedAmount)}
            tone="income"
            icon={CreditCard}
          />
          <StatCard
            label="Чистая прибыль с продлённых"
            value={formatMoney(monthSummary.renewedNetProfit)}
            tone="income"
            icon={TrendingUp}
            hint="Доход минус доля вендора и налоговый резерв, уже по факту"
          />
          <StatCard
            label="Ожидаемая прибыль до конца месяца"
            value={formatMoney(monthSummary.pendingNetProfit)}
            tone="accent"
            icon={CalendarClock}
            hint="Только по подпискам, которые ещё нужно продлить в этом месяце"
          />
        </div>
      )}

      <ListCard>
        <DataTable
          rows={subscriptions}
          columns={columns}
          getRowKey={(s) => s.id}
          // Invoice sent, money not in yet — the brand's yellow marks the row
          // as "waiting on the client" until Продлить closes the cycle.
          rowClassName={(s) => (s.invoiceSentAt ? "bg-reserve-soft hover:bg-reserve-soft" : "")}
          renderCard={(s) => (
            <RowCard
              highlight={Boolean(s.invoiceSentAt)}
              title={s.client?.name ?? "—"}
              subtitle={s.licenseProduct?.name}
              value={formatMoney(s.price)}
              meta={
                <>
                  <Badge tone={dueTone(s.nextBillingDate)}>
                    <CalendarClock className="size-3" strokeWidth={1.9} />
                    {formatDate(s.nextBillingDate)}
                  </Badge>
                  <StatusBadge label={statusLabel[s.status]} tone={statusTone[s.status]} />
                  {invoiceBadge(s)}
                  {!s.taxable && <Badge tone="reserve">на карту</Badge>}
                  <MetaItem label="Срок">{s.durationMonths} мес.</MetaItem>
                </>
              }
              actions={
                <>
                  <Button
                    size="sm"
                    variant={s.invoiceSentAt ? "ghost" : "secondary"}
                    icon={s.invoiceSentAt ? Undo2 : FileCheck2}
                    disabled={s.status !== "ACTIVE" || busyId === s.id}
                    onClick={() => handleInvoiceSent(s)}
                  >
                    {s.invoiceSentAt ? "Снять счёт" : "Счёт отправлен"}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={RefreshCw}
                    loading={busyId === s.id}
                    disabled={s.status !== "ACTIVE"}
                    onClick={() => handleBill(s)}
                  >
                    Продлить
                  </Button>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(s)}>
                    Изменить
                  </Button>
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDelete(s)}>
                    Удалить
                  </Button>
                </>
              }
            />
          )}
          empty={
            <EmptyState
              icon={RefreshCw}
              title="Подписок пока нет"
              description="Создайте первую — система сразу выставит платёж за начальный период."
              action={
                <Button variant="primary" icon={Plus} onClick={startCreate}>
                  Новая подписка
                </Button>
              }
            />
          }
        />
      </ListCard>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? "Редактирование подписки" : "Новая подписка"}
        description={
          editingId
            ? "Клиента и продукт изменить нельзя — для другого продукта создайте новую подписку."
            : "Первый платёж будет выставлен сразу после создания."
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="subscription-form" type="submit" loading={saving}>
              {editingId ? "Сохранить" : "Создать и выставить платёж"}
            </Button>
          </>
        }
      >
        <form id="subscription-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-3.5 pb-2 sm:grid-cols-2">
          {editingId ? (
            <div className="sm:col-span-2">
              <ReadonlyValue
                label="Клиент и продукт"
                value={`${editingSubscription?.client?.name} · ${editingSubscription?.licenseProduct?.name}`}
              />
            </div>
          ) : (
            <>
              <Field label="Клиент" className="sm:col-span-2">
                <Select
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setProjectId("");
                  }}
                  required
                >
                  <option value="">Выберите клиента…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Проект">
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!clientId}>
                  <option value="">Без привязки к проекту</option>
                  {projectsForClient.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Продукт">
                <Select value={licenseProductId} onChange={(e) => onSelectProduct(e.target.value)} required>
                  <option value="">Выберите продукт…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          <Field label="Цена">
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </Field>
          <Field label="Срок, мес.">
            <Input
              type="number"
              min="1"
              inputMode="numeric"
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
              required
            />
          </Field>

          {editingId ? (
            <>
              <Field label="Следующий платёж">
                <Input type="date" value={nextBillingDate} onChange={(e) => setNextBillingDate(e.target.value)} required />
              </Field>
              <Field label="Статус">
                <Select value={status} onChange={(e) => setStatus(e.target.value as Subscription["status"])}>
                  <option value="ACTIVE">{statusLabel.ACTIVE}</option>
                  <option value="PAUSED">{statusLabel.PAUSED}</option>
                  <option value="CANCELLED">{statusLabel.CANCELLED}</option>
                </Select>
              </Field>
            </>
          ) : (
            <Field label="Дата начала">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </Field>
          )}

          <Field label="Доля вендора, %">
            <Input
              type="number"
              min="0"
              max="100"
              inputMode="numeric"
              value={vendorSharePercent}
              onChange={(e) => setVendorSharePercent(e.target.value)}
              required
            />
          </Field>

          <div className="flex items-end pb-1 sm:col-span-2">
            <Checkbox label="Облагается налогом" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
          </div>

          {!editingId && selectedProduct && (
            <p className="text-xs text-ink-subtle sm:col-span-2">
              По умолчанию у продукта: {formatMoney(selectedProduct.defaultPrice)}, {selectedProduct.defaultDurationMonths} мес.,
              вендору {String(selectedProduct.defaultVendorSharePercent)}%
            </p>
          )}
        </form>
      </Modal>
    </div>
  );
}
