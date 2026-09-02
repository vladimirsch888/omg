import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Pencil, Plus, Trash2, Users } from "lucide-react";
import { api } from "../api/client";
import { Client } from "../api/types";
import {
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

export function ClientsPage() {
  const ui = useUi();
  const [clients, setClients] = useState<Client[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api.get<Client[]>("/clients").then((res) => setClients(res.data));
  }

  useEffect(load, []);

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
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось сохранить клиента", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Client) {
    const confirmed = await ui.confirm({
      title: `Удалить клиента «${c.name}»?`,
      message: "Все его проекты, заявки, часы и подписки будут удалены безвозвратно.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/clients/${c.id}`);
      ui.toast("Клиент удалён", "success");
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось удалить клиента", "error");
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
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(c)} />
          <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(c)} className="hover:text-expense" />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Клиенты"
        description="Карточка клиента собирает всю выручку по нему: проекты, разовые продажи и подписки."
        actions={
          <Button variant="primary" icon={Plus} onClick={startCreate}>
            Новый клиент
          </Button>
        }
      />

      <ListCard>
        <DataTable
          rows={clients}
          columns={columns}
          getRowKey={(c) => c.id}
          renderCard={(c) => (
            <RowCard
              title={
                <Link to={`/clients/${c.id}`} className="inline-flex items-center gap-1 text-ink">
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
                <>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(c)}>
                    Изменить
                  </Button>
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDelete(c)}>
                    Удалить
                  </Button>
                </>
              }
            />
          )}
          empty={
            <EmptyState
              icon={Users}
              title="Клиентов пока нет"
              description="Добавьте первого клиента, чтобы вести по нему проекты, продажи и подписки."
              action={
                <Button variant="primary" icon={Plus} onClick={startCreate}>
                  Новый клиент
                </Button>
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
            <Input inputMode="numeric" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} />
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
