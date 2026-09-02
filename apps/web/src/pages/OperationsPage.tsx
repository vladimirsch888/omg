import { FormEvent, useEffect, useState } from "react";
import { ArrowLeftRight, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { DictionaryType, Operation, Project } from "../api/types";
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
  RowCard,
  Select,
  useUi,
} from "../components/ui";
import { formatDate, formatMoney, toDateInputValue } from "../utils/format";

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
  const ui = useUi();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<DictionaryType | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api.get("/operations", { params: { pageSize: 100 } }).then((res) => setOperations(res.data.items));
  }

  useEffect(() => {
    load();
    api.get<Project[]>("/projects").then((res) => {
      setProjects(res.data.flatMap((p) => [p, ...(p.children ?? [])]));
    });
    api.get<DictionaryType[]>("/dictionaries").then((res) => {
      setCategories(res.data.find((d) => d.code === "operation_category") ?? null);
    });
  }, []);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
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
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
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
    try {
      if (editingId) {
        await api.patch(`/operations/${editingId}`, payload);
        ui.toast("Операция обновлена", "success");
      } else {
        await api.post("/operations", payload);
        ui.toast("Операция добавлена", "success");
      }
      setFormOpen(false);
      setEditingId(null);
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось сохранить операцию", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(o: Operation) {
    const confirmed = await ui.confirm({
      title: "Удалить операцию?",
      message: `${o.type === "INCOME" ? "Доход" : "Расход"} на ${formatMoney(o.amount)} от ${formatDate(o.accrualDate)}.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/operations/${o.id}`);
      ui.toast("Операция удалена", "success");
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось удалить операцию", "error");
    }
  }

  const amountCell = (o: Operation) => (
    <span className={`font-medium ${o.type === "INCOME" ? "text-income" : "text-expense"}`}>
      {o.type === "INCOME" ? "+" : "−"}
      {formatMoney(o.amount)}
    </span>
  );

  const columns: Column<Operation>[] = [
    { key: "date", header: "Дата", render: (o) => <span className="text-ink-muted">{formatDate(o.accrualDate)}</span> },
    {
      key: "project",
      header: "Проект",
      hideBelow: "md",
      render: (o) => <span className="text-ink-muted">{o.project?.name ?? "Компания"}</span>,
    },
    {
      key: "category",
      header: "Категория",
      hideBelow: "lg",
      render: (o) => <span className="text-ink-muted">{o.categoryValue?.name ?? "—"}</span>,
    },
    {
      key: "description",
      header: "Описание",
      render: (o) => <span className="text-ink">{o.description || (o.type === "INCOME" ? "Доход" : "Расход")}</span>,
    },
    { key: "amount", header: "Сумма", align: "right", render: amountCell },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (o) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(o)} />
          <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(o)} className="hover:text-expense" />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Операции"
        description="Все доходы и расходы компании. Дата начисления идёт в PnL, дата оплаты — в ДДС."
        actions={
          <Button variant="primary" icon={Plus} onClick={startCreate}>
            Новая операция
          </Button>
        }
      />

      <ListCard>
        <DataTable
          rows={operations}
          columns={columns}
          getRowKey={(o) => o.id}
          renderCard={(o) => (
            <RowCard
              title={o.description || (o.type === "INCOME" ? "Доход" : "Расход")}
              subtitle={o.project?.name ?? "Общая операция компании"}
              value={`${o.type === "INCOME" ? "+" : "−"}${formatMoney(o.amount)}`}
              valueTone={o.type === "INCOME" ? "income" : "expense"}
              meta={
                <>
                  <MetaItem label="Дата">{formatDate(o.accrualDate)}</MetaItem>
                  {o.categoryValue?.name && <Badge>{o.categoryValue.name}</Badge>}
                  {o.taxable === false && <Badge tone="reserve">на карту</Badge>}
                </>
              }
              actions={
                <>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(o)}>
                    Изменить
                  </Button>
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDelete(o)}>
                    Удалить
                  </Button>
                </>
              }
            />
          )}
          empty={
            <EmptyState
              icon={ArrowLeftRight}
              title="Операций пока нет"
              description="Добавьте первую операцию вручную — или они появятся сами при продажах и продлениях."
              action={
                <Button variant="primary" icon={Plus} onClick={startCreate}>
                  Новая операция
                </Button>
              }
            />
          }
        />
      </ListCard>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? "Редактирование операции" : "Новая операция"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="operation-form" type="submit" loading={saving}>
              Сохранить
            </Button>
          </>
        }
      >
        <form id="operation-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-3.5 pb-2 sm:grid-cols-2">
          <Field label="Тип">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "INCOME" | "EXPENSE" })}>
              <option value="INCOME">Доход</option>
              <option value="EXPENSE">Расход</option>
            </Select>
          </Field>

          <Field label="Сумма">
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </Field>

          <Field label="Проект">
            <Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">Без проекта (общая операция компании)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Категория">
            <Select value={form.categoryValueId} onChange={(e) => setForm({ ...form, categoryValueId: e.target.value })}>
              <option value="">Без категории</option>
              {categories?.values.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Дата начисления" hint="Попадает в PnL">
            <Input
              type="date"
              value={form.accrualDate}
              onChange={(e) => setForm({ ...form, accrualDate: e.target.value })}
              required
            />
          </Field>

          <Field label="Дата оплаты" hint="Попадает в ДДС">
            <Input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
          </Field>

          {form.type === "INCOME" && (
            <>
              <Field label="Доля вендора, %" hint="0 — для собственных услуг">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  inputMode="numeric"
                  value={form.vendorSharePercent}
                  onChange={(e) => setForm({ ...form, vendorSharePercent: e.target.value })}
                />
              </Field>
              <div className="flex items-end pb-2.5">
                <Checkbox
                  label="Облагается налогом"
                  checked={form.taxable}
                  onChange={(e) => setForm({ ...form, taxable: e.target.checked })}
                />
              </div>
            </>
          )}

          <Field label="Описание" className="sm:col-span-2">
            <Input
              placeholder="Например: оплата лицензии за сентябрь"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
