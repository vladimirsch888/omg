import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { Client } from "../api/types";
import { useAuth } from "../context/AuthContext";
import {
  Button,
  ListCard,
  Column,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  IconButton,
  Input,
  MetaItem,
  Modal,
  PageHeader,
  RowCard,
  Select,
  StatusBadge,
  useUi,
  type BadgeTone,
} from "../components/ui";

const emptyForm = {
  name: "",
  legalName: "",
  inn: "",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
  status: "ACTIVE" as Client["status"],
  notes: "",
};

const statusLabel: Record<Client["status"], string> = {
  ACTIVE: "Активен",
  PAUSED: "Приостановлен",
  CHURNED: "Ушёл",
};

const statusTone: Record<Client["status"], BadgeTone> = {
  ACTIVE: "income",
  PAUSED: "reserve",
  CHURNED: "neutral",
};

interface DeleteImpact {
  projects: number;
  subscriptions: number;
  sales: number;
  operations: number;
}

export function ClientsPage() {
  const ui = useUi();
  const { canEdit } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api
      .get<Client[]>("/clients", { params: { q: search || undefined, status: status || undefined } })
      .then((res) => setClients(res.data));
  }

  // Debounced search so the list doesn't refetch on every keystroke.
  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
  }

  function startEdit(c: Client) {
    setForm({
      name: c.name,
      legalName: c.legalName ?? "",
      inn: c.inn ?? "",
      contactPerson: c.contactPerson ?? "",
      contactEmail: c.contactEmail ?? "",
      contactPhone: c.contactPhone ?? "",
      status: c.status,
      notes: c.notes ?? "",
    });
    setEditingId(c.id);
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      legalName: form.legalName || undefined,
      inn: form.inn || undefined,
      contactPerson: form.contactPerson || undefined,
      contactEmail: form.contactEmail || undefined,
      contactPhone: form.contactPhone || undefined,
      status: form.status,
      notes: form.notes || undefined,
    };
    try {
      if (editingId) {
        await api.patch(`/clients/${editingId}`, payload);
        ui.toast("Клиент обновлён", "success");
      } else {
        await api.post("/clients", payload);
        ui.toast("Клиент добавлен", "success");
      }
      setFormOpen(false);
      setEditingId(null);
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось сохранить клиента"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Client) {
    let impact: DeleteImpact | null = null;
    try {
      impact = (await api.get<DeleteImpact>(`/clients/${c.id}/delete-impact`)).data;
    } catch {
      // The confirm below still works without the counts.
    }
    const parts: string[] = [];
    if (impact) {
      if (impact.projects) parts.push(`проектов: ${impact.projects}`);
      if (impact.subscriptions) parts.push(`подписок: ${impact.subscriptions}`);
      if (impact.sales) parts.push(`продаж: ${impact.sales}`);
    }
    const confirmed = await ui.confirm({
      title: `Удалить клиента «${c.name}»?`,
      message: (
        <>
          Безвозвратно удалятся его проекты с заявками и часами, подписки и продажи
          {parts.length > 0 && <> ({parts.join(", ")})</>}.
          {impact && impact.operations > 0 && (
            <>
              {" "}Проведённые операции ({impact.operations}) останутся в разделе «Операции», но потеряют привязку к клиенту.
            </>
          )}{" "}
          Если хотите сохранить историю — поставьте статус «Ушёл».
        </>
      ),
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/clients/${c.id}`);
      ui.toast("Клиент удалён", "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось удалить клиента"), "error");
    }
  }

  const columns: Column<Client>[] = [
    {
      key: "name",
      header: "Название",
      render: (c) => (
        <Link to={`/clients/${c.id}`} className="font-medium text-ink transition-colors hover:text-accent">
          {c.name}
        </Link>
      ),
    },
    { key: "inn", header: "ИНН", hideBelow: "lg", render: (c) => <span className="text-ink-muted">{c.inn ?? "—"}</span> },
    {
      key: "contact",
      header: "Контакт",
      hideBelow: "md",
      render: (c) => <span className="text-ink-muted">{c.contactPerson ?? "—"}</span>,
    },
    { key: "status", header: "Статус", render: (c) => <StatusBadge label={statusLabel[c.status]} tone={statusTone[c.status]} /> },
    {
      key: "projects",
      header: "Проектов",
      align: "right",
      render: (c) => <span className="text-ink-muted">{c.projectsCount ?? 0}</span>,
    },
    ...(canEdit
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            render: (c: Client) => (
              <div className="flex items-center justify-end gap-1">
                <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(c)} />
                <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(c)} className="hover:text-expense" />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Клиенты"
        description="Карточка клиента собирает всю выручку по нему: проекты, разовые продажи и подписки."
        actions={
          canEdit && (
            <Button variant="primary" icon={Plus} onClick={startCreate}>
              Новый клиент
            </Button>
          )
        }
      />

      <FilterBar>
        <Field label="Поиск" className="min-w-52 flex-1 sm:max-w-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" strokeWidth={1.8} />
            <Input placeholder="Название, ИНН, контакт" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </Field>
        <Field label="Статус">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Все</option>
            <option value="ACTIVE">{statusLabel.ACTIVE}</option>
            <option value="PAUSED">{statusLabel.PAUSED}</option>
            <option value="CHURNED">{statusLabel.CHURNED}</option>
          </Select>
        </Field>
      </FilterBar>

      <ListCard>
        <DataTable
          rows={clients}
          columns={columns}
          getRowKey={(c) => c.id}
          renderCard={(c) => (
            <RowCard
              title={
                <Link to={`/clients/${c.id}`} className="-my-1 inline-flex min-h-11 items-center gap-1 py-1 text-ink">
                  {c.name}
                  <ChevronRight className="size-3.5 text-ink-subtle" />
                </Link>
              }
              subtitle={c.contactPerson ?? c.legalName ?? undefined}
              meta={
                <>
                  <StatusBadge label={statusLabel[c.status]} tone={statusTone[c.status]} />
                  <MetaItem label="Проектов">{c.projectsCount ?? 0}</MetaItem>
                  {c.inn && <MetaItem label="ИНН">{c.inn}</MetaItem>}
                </>
              }
              actions={
                canEdit && (
                  <>
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(c)}>
                      Изменить
                    </Button>
                    <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDelete(c)}>
                      Удалить
                    </Button>
                  </>
                )
              }
            />
          )}
          empty={
            <EmptyState
              icon={Users}
              title={search || status ? "Ничего не найдено" : "Клиентов пока нет"}
              description={search || status ? "Попробуйте изменить поиск или фильтр." : "Добавьте первого клиента, чтобы вести по нему проекты, продажи и подписки."}
              action={
                canEdit && !search && !status ? (
                  <Button variant="primary" icon={Plus} onClick={startCreate}>
                    Новый клиент
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </ListCard>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? "Редактирование клиента" : "Новый клиент"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="client-form" type="submit" loading={saving}>
              Сохранить
            </Button>
          </>
        }
      >
        <form id="client-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-3.5 pb-2 sm:grid-cols-2">
          <Field label="Название компании" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Юридическое название">
            <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
          </Field>
          <Field label="ИНН">
            <Input inputMode="numeric" pattern="\d*" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label="Контактное лицо">
            <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
          </Field>
          <Field label="Статус">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Client["status"] })}>
              <option value="ACTIVE">{statusLabel.ACTIVE}</option>
              <option value="PAUSED">{statusLabel.PAUSED}</option>
              <option value="CHURNED">{statusLabel.CHURNED}</option>
            </Select>
          </Field>
          <Field label="Email">
            <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </Field>
          <Field label="Телефон">
            <Input type="tel" inputMode="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </Field>
          <Field label="Заметки" className="sm:col-span-2">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
