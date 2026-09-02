import { FormEvent, useEffect, useState } from "react";
import { CalendarCheck, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { Client, LicenseProduct, Project, Sale } from "../api/types";
import {
  Badge,
  Button,
  ListCard,
  Column,
  DataTable,
  EmptyState,
  Field,
  IconButton,
  Input,
  MetaItem,
  Modal,
  PageHeader,
  RowCard,
  Select,
  useUi,
} from "../components/ui";
import { addWorkingDays, formatDate, formatMoney, toDateInputValue } from "../utils/format";

const emptyForm = {
  clientId: "",
  projectId: "",
  licenseProductId: "",
  amount: "",
  saleDate: new Date().toISOString().slice(0, 10),
  workDays: "",
  workEndDate: "",
};

function computeWorkEndDate(saleDate: string, workDays: string): string {
  const days = Number(workDays);
  if (!saleDate || !days || days <= 0) return "";
  return addWorkingDays(new Date(saleDate), days).toISOString().slice(0, 10);
}

export function SalesPage() {
  const ui = useUi();
  const [sales, setSales] = useState<Sale[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<LicenseProduct[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  function onSelectProduct(licenseProductId: string) {
    const product = products.find((p) => p.id === licenseProductId);
    if (product?.type === "WORK") {
      const workDays = product.defaultWorkDays != null ? String(product.defaultWorkDays) : "";
      setForm({
        ...form,
        licenseProductId,
        amount: String(product.defaultPrice),
        workDays,
        workEndDate: computeWorkEndDate(form.saleDate, workDays),
      });
    } else {
      setForm({
        ...form,
        licenseProductId,
        amount: product ? String(product.defaultPrice) : form.amount,
        workDays: "",
        workEndDate: "",
      });
    }
  }

  function onChangeSaleDate(saleDate: string) {
    setForm({
      ...form,
      saleDate,
      workEndDate: form.workDays ? computeWorkEndDate(saleDate, form.workDays) : form.workEndDate,
    });
  }

  function onChangeWorkDays(workDays: string) {
    setForm({ ...form, workDays, workEndDate: computeWorkEndDate(form.saleDate, workDays) });
  }

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
  }

  function startEdit(sale: Sale) {
    setForm({
      clientId: sale.clientId,
      projectId: sale.projectId ?? "",
      licenseProductId: sale.licenseProductId,
      amount: String(sale.amount),
      saleDate: toDateInputValue(sale.saleDate),
      // The original working-days count isn't stored — only the resulting
      // date is; leave it blank so it isn't misread as freshly recomputed.
      workDays: "",
      workEndDate: toDateInputValue(sale.workEndDate),
    });
    setEditingId(sale.id);
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      clientId: form.clientId,
      projectId: form.projectId || undefined,
      licenseProductId: form.licenseProductId,
      amount: Number(form.amount),
      saleDate: new Date(form.saleDate).toISOString(),
      // When editing, explicitly clear a stale work end date if the product
      // was switched away from WORK; on create there's nothing to clear.
      workEndDate:
        selectedProduct?.type === "WORK" && form.workEndDate
          ? new Date(form.workEndDate).toISOString()
          : editingId
          ? null
          : undefined,
    };
    try {
      if (editingId) {
        await api.patch(`/sales/${editingId}`, payload);
        ui.toast("Продажа обновлена", "success");
      } else {
        await api.post("/sales", payload);
        ui.toast("Продажа проведена", "success");
      }
      setFormOpen(false);
      setEditingId(null);
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось сохранить продажу", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sale: Sale) {
    const confirmed = await ui.confirm({
      title: "Удалить продажу?",
      message: `${sale.licenseProduct?.name} — ${sale.client?.name} на ${formatMoney(sale.amount)}.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/sales/${sale.id}`);
      ui.toast("Продажа удалена", "success");
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось удалить продажу", "error");
    }
  }

  const columns: Column<Sale>[] = [
    { key: "date", header: "Дата", render: (s) => <span className="text-ink-muted">{formatDate(s.saleDate)}</span> },
    { key: "client", header: "Клиент", render: (s) => <span className="font-medium text-ink">{s.client?.name}</span> },
    {
      key: "project",
      header: "Проект",
      hideBelow: "lg",
      render: (s) => <span className="text-ink-muted">{s.project?.name ?? "—"}</span>,
    },
    {
      key: "product",
      header: "Продукт",
      render: (s) => (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-ink-muted">
            {s.licenseProduct?.name}
            {!s.taxable && <Badge tone="reserve">на карту</Badge>}
          </span>
          {s.workEndDate && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-subtle">
              <CalendarCheck className="size-3" strokeWidth={1.8} />
              работы до {formatDate(s.workEndDate)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Сумма",
      align: "right",
      render: (s) => <span className="font-medium text-income">{formatMoney(s.amount)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(s)} />
          <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(s)} className="hover:text-expense" />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Продажи"
        description="Разовая продажа продукта клиенту: доля вендора и налоговый резерв считаются автоматически по умолчаниям продукта. Для лицензий с продлением используйте раздел «Подписки»."
        actions={
          <Button variant="primary" icon={Plus} onClick={startCreate}>
            Новая продажа
          </Button>
        }
      />

      <ListCard>
        <DataTable
          rows={sales}
          columns={columns}
          getRowKey={(s) => s.id}
          renderCard={(s) => (
            <RowCard
              title={s.client?.name ?? "—"}
              subtitle={s.licenseProduct?.name}
              value={formatMoney(s.amount)}
              valueTone="income"
              meta={
                <>
                  <MetaItem label="Дата">{formatDate(s.saleDate)}</MetaItem>
                  {!s.taxable && <Badge tone="reserve">на карту</Badge>}
                  {s.project?.name && <MetaItem label="Проект">{s.project.name}</MetaItem>}
                  {s.workEndDate && <MetaItem label="Работы до">{formatDate(s.workEndDate)}</MetaItem>}
                </>
              }
              actions={
                <>
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
              icon={Receipt}
              title="Продаж пока нет"
              description="Проведите первую продажу — операции дохода и расхода на вендора создадутся автоматически."
              action={
                <Button variant="primary" icon={Plus} onClick={startCreate}>
                  Новая продажа
                </Button>
              }
            />
          }
        />
      </ListCard>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? "Редактирование продажи" : "Новая продажа"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="sale-form" type="submit" loading={saving}>
              {editingId ? "Сохранить" : "Провести продажу"}
            </Button>
          </>
        }
      >
        <form id="sale-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-3.5 pb-2 sm:grid-cols-2">
          <Field label="Клиент" className="sm:col-span-2">
            <Select
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value, projectId: "" })}
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
            <Select
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              disabled={!form.clientId}
            >
              <option value="">Без привязки к проекту</option>
              {projectsForClient.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Продукт">
            <Select value={form.licenseProductId} onChange={(e) => onSelectProduct(e.target.value)} required>
              <option value="">Выберите продукт…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Сумма продажи">
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </Field>

          <Field label="Дата продажи">
            <Input type="date" value={form.saleDate} onChange={(e) => onChangeSaleDate(e.target.value)} required />
          </Field>

          {selectedProduct?.type === "WORK" && (
            <>
              <Field label="Срок выполнения, раб. дней" hint="Считается без выходных и подставляет дату окончания">
                <Input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder="Например, 20"
                  value={form.workDays}
                  onChange={(e) => onChangeWorkDays(e.target.value)}
                />
              </Field>
              <Field label="Дата окончания работ">
                <Input
                  type="date"
                  value={form.workEndDate}
                  onChange={(e) => setForm({ ...form, workEndDate: e.target.value })}
                  required
                />
              </Field>
            </>
          )}

          {selectedProduct && (
            <p className="text-xs text-ink-subtle sm:col-span-2">
              Вендору {String(selectedProduct.defaultVendorSharePercent)}%
              {!selectedProduct.defaultTaxable && ", без налогового резерва (оплата на карту)"}
            </p>
          )}
        </form>
      </Modal>
    </div>
  );
}
