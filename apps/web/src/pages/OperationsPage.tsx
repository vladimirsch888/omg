import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeftRight, Copy, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { Client, DictionaryType, Operation, Paged, Project } from "../api/types";
import { useAuth } from "../context/AuthContext";
import {
  Badge,
  Button,
  ListCard,
  Checkbox,
  Column,
  DataTable,
  EmptyState,
  ExportButton,
  Field,
  FilterBar,
  IconButton,
  Input,
  MetaItem,
  Modal,
  PageHeader,
  Pagination,
  RowCard,
  Select,
  useUi,
} from "../components/ui";
import { dateInputToIso, downloadFile, formatDate, formatMoney, todayInput, toDateInputValue } from "../utils/format";

interface OperationForm {
  type: "INCOME" | "EXPENSE";
  status: "PLANNED" | "ACTUAL";
  projectId: string;
  amount: string;
  accrualDate: string;
  paymentDate: string;
  categoryValueId: string;
  accountValueId: string;
  counterparty: string;
  description: string;
  vendorSharePercent: string;
  taxable: boolean;
  taxPayment: boolean;
}

/** Built when the form opens, so "today" is really today (and local time). */
function emptyForm(): OperationForm {
  const today = todayInput();
  return {
    type: "INCOME",
    status: "ACTUAL",
    projectId: "",
    amount: "",
    accrualDate: today,
    paymentDate: today,
    categoryValueId: "",
    accountValueId: "",
    counterparty: "",
    description: "",
    vendorSharePercent: "0",
    taxable: true,
    taxPayment: false,
  };
}

const PAGE_SIZE = 50;

export function OperationsPage() {
  const ui = useUi();
  const { canEdit } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<Paged<Operation> | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<DictionaryType | null>(null);
  const [accounts, setAccounts] = useState<DictionaryType | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OperationForm>(emptyForm);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filters live in the URL so a link like /operations?projectId=… works
  // from the project page and the back button restores the view.
  const filters = {
    q: searchParams.get("q") ?? "",
    type: searchParams.get("type") ?? "",
    status: searchParams.get("status") ?? "",
    projectId: searchParams.get("projectId") ?? "",
    clientId: searchParams.get("clientId") ?? "",
    categoryValueId: searchParams.get("categoryValueId") ?? "",
    accountValueId: searchParams.get("accountValueId") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    page: Number(searchParams.get("page") ?? "1") || 1,
  };
  const [searchDraft, setSearchDraft] = useState(filters.q);

  function setFilter(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "" || value === 0) next.delete(key);
      else next.set(key, String(value));
    }
    if (!("page" in patch)) next.delete("page");
    setSearchParams(next, { replace: true });
  }

  const queryParams = useMemo(
    () => ({
      q: filters.q || undefined,
      type: filters.type || undefined,
      status: filters.status || undefined,
      projectId: filters.projectId || undefined,
      clientId: filters.clientId || undefined,
      categoryValueId: filters.categoryValueId || undefined,
      accountValueId: filters.accountValueId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams]
  );

  function load() {
    api
      .get<Paged<Operation>>("/operations", { params: { ...queryParams, page: filters.page, pageSize: PAGE_SIZE } })
      .then((res) => {
        setData(res.data);
        setSelected(new Set());
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== filters.q) setFilter({ q: searchDraft });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  useEffect(() => {
    api.get<Project[]>("/projects").then((res) => {
      setProjects(res.data.flatMap((p) => [p, ...(p.children ?? [])]));
    });
    api.get<Client[]>("/clients").then((res) => setClients(res.data));
    api.get<DictionaryType[]>("/dictionaries").then((res) => {
      setCategories(res.data.find((d) => d.code === "operation_category") ?? null);
      setAccounts(res.data.find((d) => d.code === "account") ?? null);
    });
  }, []);

  function startCreate() {
    setForm(emptyForm());
    setEditingId(null);
    setFormOpen(true);
  }

  function fillFrom(o: Operation): OperationForm {
    return {
      type: o.type,
      status: o.status,
      projectId: o.projectId ?? "",
      amount: String(o.amount),
      accrualDate: toDateInputValue(o.accrualDate),
      paymentDate: toDateInputValue(o.paymentDate),
      categoryValueId: o.categoryValueId ?? "",
      accountValueId: o.accountValueId ?? "",
      counterparty: o.counterparty ?? "",
      description: o.description ?? "",
      vendorSharePercent: String(o.vendorSharePercent ?? 0),
      taxable: o.taxable ?? true,
      taxPayment: o.taxPayment ?? false,
    };
  }

  function startEdit(o: Operation) {
    setForm(fillFrom(o));
    setEditingId(o.id);
    setFormOpen(true);
  }

  /** Same operation, today's dates, not yet saved — for the monthly repeats. */
  function startDuplicate(o: Operation) {
    const today = todayInput();
    setForm({ ...fillFrom(o), accrualDate: today, paymentDate: o.paymentDate ? today : "" });
    setEditingId(null);
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const isIncome = form.type === "INCOME";
    const payload = {
      type: form.type,
      status: form.status,
      projectId: form.projectId || null,
      amount: Number(form.amount),
      accrualDate: dateInputToIso(form.accrualDate),
      paymentDate: form.paymentDate ? dateInputToIso(form.paymentDate) : null,
      categoryValueId: form.categoryValueId || null,
      accountValueId: form.accountValueId || null,
      counterparty: form.counterparty || undefined,
      description: form.description || undefined,
      vendorSharePercent: isIncome ? Number(form.vendorSharePercent) : 0,
      taxable: isIncome ? form.taxable : true,
      taxPayment: !isIncome ? form.taxPayment : false,
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
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось сохранить операцию"), "error");
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
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось удалить операцию"), "error");
    }
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    const confirmed = await ui.confirm({
      title: `Удалить ${ids.length} ${pluralOperations(ids.length)}?`,
      message: "Отменить это будет нельзя. Операции, созданные подписками и продажами, тоже удалятся.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      const res = await api.post<{ deleted: number }>("/operations/bulk-delete", { ids });
      ui.toast(`Удалено операций: ${res.data.deleted}`, "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось удалить операции"), "error");
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const qs = new URLSearchParams(Object.entries(queryParams).filter(([, v]) => v) as [string, string][]);
      await downloadFile(`/api/export/operations.csv?${qs}`, "операции.csv");
    } catch (err) {
      ui.toast((err as Error).message, "error");
    } finally {
      setExporting(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rows = data?.items ?? [];
  const allSelected = rows.length > 0 && rows.every((o) => selected.has(o.id));

  const amountCell = (o: Operation) => (
    <span className={`font-medium ${o.type === "INCOME" ? "text-income" : "text-expense"}`}>
      {o.type === "INCOME" ? "+" : "−"}
      {formatMoney(o.amount)}
    </span>
  );

  const columns: Column<Operation>[] = [
    ...(canEdit
      ? [
          {
            key: "select",
            header: (
              <input
                type="checkbox"
                aria-label="Выбрать все на странице"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((o) => o.id)))}
                className="size-4 cursor-pointer accent-[var(--color-accent)]"
              />
            ),
            width: "2rem",
            render: (o: Operation) => (
              <input
                type="checkbox"
                aria-label="Выбрать операцию"
                checked={selected.has(o.id)}
                onChange={() => toggleSelected(o.id)}
                className="size-4 cursor-pointer accent-[var(--color-accent)]"
              />
            ),
          },
        ]
      : []),
    { key: "date", header: "Дата", nowrap: true, render: (o) => <span className="text-ink-muted">{formatDate(o.accrualDate)}</span> },
    {
      key: "project",
      header: "Проект",
      hideBelow: "md",
      render: (o) => <span className="text-ink-muted">{o.project?.name ?? "Компания"}</span>,
    },
    {
      key: "category",
      header: "Категория",
      hideBelow: "xl",
      render: (o) => <span className="text-ink-muted">{o.categoryValue?.name ?? "—"}</span>,
    },
    {
      key: "description",
      header: "Описание",
      render: (o) => (
        <span className="flex flex-wrap items-center gap-1.5 text-ink">
          {o.description || (o.type === "INCOME" ? "Доход" : "Расход")}
          {o.status === "PLANNED" && <Badge tone="reserve">план</Badge>}
          {o.taxPayment && <Badge tone="accent">налог</Badge>}
          {o.taxable === false && o.type === "INCOME" && <Badge tone="reserve">на карту</Badge>}
        </span>
      ),
    },
    { key: "amount", header: "Сумма", align: "right", render: amountCell },
    ...(canEdit
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            render: (o: Operation) => (
              <div className="flex items-center justify-end gap-1">
                <IconButton icon={Copy} label="Дублировать" onClick={() => startDuplicate(o)} />
                <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(o)} />
                <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(o)} className="hover:text-expense" />
              </div>
            ),
          },
        ]
      : []),
  ];

  const hasFilters = Object.values(queryParams).some(Boolean);
  const categoryOptions = categories?.values.filter((v) => v.isActive || v.id === form.categoryValueId) ?? [];
  const accountOptions = accounts?.values.filter((v) => v.isActive || v.id === form.accountValueId) ?? [];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Операции"
        description="Все доходы и расходы компании. Дата начисления идёт в PnL, дата оплаты — в ДДС."
        actions={
          <>
            <ExportButton onClick={handleExport} loading={exporting} />
            {canEdit && (
              <Button variant="primary" icon={Plus} onClick={startCreate}>
                Новая операция
              </Button>
            )}
          </>
        }
      />

      <FilterBar>
        <Field label="Поиск" className="min-w-48 flex-1 sm:max-w-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" strokeWidth={1.8} />
            <Input placeholder="Описание или контрагент" className="pl-9" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
          </div>
        </Field>
        <Field label="Тип">
          <Select value={filters.type} onChange={(e) => setFilter({ type: e.target.value })}>
            <option value="">Все</option>
            <option value="INCOME">Доходы</option>
            <option value="EXPENSE">Расходы</option>
          </Select>
        </Field>
        <Field label="Период с">
          <Input type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} />
        </Field>
        <Field label="по">
          <Input type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} />
        </Field>
        <Field label="Клиент" className="min-w-40">
          <Select value={filters.clientId} onChange={(e) => setFilter({ clientId: e.target.value, projectId: "" })}>
            <option value="">Все</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Проект" className="min-w-40">
          <Select value={filters.projectId} onChange={(e) => setFilter({ projectId: e.target.value })}>
            <option value="">Все</option>
            {projects.filter((p) => !filters.clientId || p.clientId === filters.clientId).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Категория" className="min-w-40">
          <Select value={filters.categoryValueId} onChange={(e) => setFilter({ categoryValueId: e.target.value })}>
            <option value="">Все</option>
            {categories?.values.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </Select>
        </Field>
        {accounts && accounts.values.length > 0 && (
          <Field label="Счёт">
            <Select value={filters.accountValueId} onChange={(e) => setFilter({ accountValueId: e.target.value })}>
              <option value="">Все</option>
              {accounts.values.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Статус">
          <Select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}>
            <option value="">Все</option>
            <option value="ACTUAL">Проведено</option>
            <option value="PLANNED">План</option>
          </Select>
        </Field>
        {hasFilters && (
          <Button variant="ghost" icon={X} onClick={() => { setSearchDraft(""); setSearchParams({}, { replace: true }); }}>
            Сбросить
          </Button>
        )}
      </FilterBar>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-2.5 text-sm">
          <span className="text-ink">
            Выбрано: <span className="font-medium tnum">{selected.size}</span>
          </span>
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Снять выбор
            </Button>
            <Button size="sm" variant="danger" icon={Trash2} onClick={handleBulkDelete}>
              Удалить выбранные
            </Button>
          </span>
        </div>
      )}

      <ListCard>
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(o) => o.id}
          rowClassName={(o) => (selected.has(o.id) ? "bg-accent-soft/40" : "")}
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
                  {o.status === "PLANNED" && <Badge tone="reserve">план</Badge>}
                  {o.taxPayment && <Badge tone="accent">налог</Badge>}
                  {o.taxable === false && o.type === "INCOME" && <Badge tone="reserve">на карту</Badge>}
                </>
              }
              actions={
                canEdit && (
                  <>
                    <Button size="sm" variant="ghost" icon={Copy} onClick={() => startDuplicate(o)}>
                      Дублировать
                    </Button>
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(o)}>
                      Изменить
                    </Button>
                    <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDelete(o)}>
                      Удалить
                    </Button>
                  </>
                )
              }
            />
          )}
          empty={
            <EmptyState
              icon={ArrowLeftRight}
              title={hasFilters ? "Ничего не найдено" : "Операций пока нет"}
              description={hasFilters ? "Попробуйте изменить фильтры." : "Добавьте первую операцию вручную — или они появятся сами при продажах и продлениях."}
              action={
                canEdit && !hasFilters ? (
                  <Button variant="primary" icon={Plus} onClick={startCreate}>
                    Новая операция
                  </Button>
                ) : undefined
              }
            />
          }
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => setFilter({ page })} />}
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
              min="0.01"
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
              {categoryOptions.map((v) => (
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

          <Field label="Дата оплаты" hint="Попадает в ДДС; пусто — деньги ещё не двигались">
            <Input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
          </Field>

          <Field label="Счёт / касса">
            <Select value={form.accountValueId} onChange={(e) => setForm({ ...form, accountValueId: e.target.value })}>
              <option value="">Не указан</option>
              {accountOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Статус">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "PLANNED" | "ACTUAL" })}>
              <option value="ACTUAL">Проведена</option>
              <option value="PLANNED">Запланирована</option>
            </Select>
          </Field>

          <Field label="Контрагент">
            <Input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
          </Field>

          {form.type === "INCOME" ? (
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
          ) : (
            <div className="flex items-end pb-2.5 sm:col-span-2">
              <Checkbox
                label="Это уплата налога — уменьшает резерв на налог"
                checked={form.taxPayment}
                onChange={(e) => setForm({ ...form, taxPayment: e.target.checked })}
              />
            </div>
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

function pluralOperations(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "операцию";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "операции";
  return "операций";
}
