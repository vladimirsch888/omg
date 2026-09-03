import { FormEvent, useEffect, useState } from "react";
import { Inbox, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { Project, RequestTicket } from "../api/types";
import { useAuth } from "../context/AuthContext";
import {
  Badge,
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
  SelectCompact,
  useUi,
  type BadgeTone,
} from "../components/ui";

const emptyForm = {
  projectId: "",
  title: "",
  description: "",
  priority: "MEDIUM" as RequestTicket["priority"],
};

const statusLabel: Record<RequestTicket["status"], string> = {
  OPEN: "Открыта",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};

const priorityLabel: Record<RequestTicket["priority"], string> = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
};

const priorityTone: Record<RequestTicket["priority"], BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "accent",
  HIGH: "expense",
};

export function RequestsPage() {
  const ui = useUi();
  const { canEdit } = useAuth();
  const [requests, setRequests] = useState<RequestTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  function load() {
    api
      .get<RequestTicket[]>("/requests", {
        params: { q: search || undefined, status: statusFilter || undefined, projectId: projectFilter || undefined },
      })
      .then((res) => setRequests(res.data));
  }

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, projectFilter]);

  useEffect(() => {
    api.get<Project[]>("/projects").then((res) => setProjects(res.data.flatMap((p) => [p, ...(p.children ?? [])])));
  }, []);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
  }

  function startEdit(r: RequestTicket) {
    setForm({
      projectId: r.projectId,
      title: r.title,
      description: r.description ?? "",
      priority: r.priority,
    });
    setEditingId(r.id);
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      projectId: form.projectId,
      title: form.title,
      description: form.description || undefined,
      priority: form.priority,
    };
    try {
      if (editingId) {
        await api.patch(`/requests/${editingId}`, payload);
        ui.toast("Заявка обновлена", "success");
      } else {
        await api.post("/requests", payload);
        ui.toast("Заявка создана", "success");
      }
      setFormOpen(false);
      setEditingId(null);
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось сохранить заявку"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: RequestTicket["status"]) {
    try {
      await api.patch(`/requests/${id}`, { status });
      ui.toast(`Заявка: ${statusLabel[status].toLowerCase()}`, "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось изменить статус заявки"), "error");
    }
  }

  async function handleDelete(r: RequestTicket) {
    const confirmed = await ui.confirm({
      title: `Удалить заявку «${r.title}»?`,
      message: "Записи учёта часов останутся, но потеряют привязку к заявке.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/requests/${r.id}`);
      ui.toast("Заявка удалена", "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось удалить заявку"), "error");
    }
  }

  const projectName = (r: RequestTicket) => r.project?.name ?? "—";

  const statusSelect = (r: RequestTicket) =>
    canEdit ? (
      <SelectCompact value={r.status} onChange={(e) => updateStatus(r.id, e.target.value as RequestTicket["status"])}>
        <option value="OPEN">{statusLabel.OPEN}</option>
        <option value="IN_PROGRESS">{statusLabel.IN_PROGRESS}</option>
        <option value="DONE">{statusLabel.DONE}</option>
        <option value="CANCELLED">{statusLabel.CANCELLED}</option>
      </SelectCompact>
    ) : (
      <span className="text-ink-muted">{statusLabel[r.status]}</span>
    );

  const columns: Column<RequestTicket>[] = [
    { key: "title", header: "Заявка", render: (r) => <span className="font-medium text-ink">{r.title}</span> },
    { key: "project", header: "Проект", hideBelow: "md", render: (r) => <span className="text-ink-muted">{projectName(r)}</span> },
    {
      key: "priority",
      header: "Приоритет",
      hideBelow: "lg",
      render: (r) => <Badge tone={priorityTone[r.priority]}>{priorityLabel[r.priority]}</Badge>,
    },
    {
      key: "hours",
      header: "Часы",
      align: "right",
      render: (r) => <span className="text-ink-muted">{r.totalHours ?? 0} ч</span>,
    },
    { key: "status", header: "Статус", width: "10rem", render: statusSelect },
    ...(canEdit
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            render: (r: RequestTicket) => (
              <div className="flex items-center justify-end gap-1">
                <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(r)} />
                <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(r)} className="hover:text-expense" />
              </div>
            ),
          },
        ]
      : []),
  ];

  const hasFilters = Boolean(search || statusFilter || projectFilter);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Заявки клиентов"
        description="Обращения по проектам: на них списываются часы, а статус показывает, что ещё в работе."
        actions={
          canEdit && (
            <Button variant="primary" icon={Plus} onClick={startCreate}>
              Новая заявка
            </Button>
          )
        }
      />

      <FilterBar>
        <Field label="Поиск" className="min-w-48 flex-1 sm:max-w-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" strokeWidth={1.8} />
            <Input placeholder="Название заявки" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </Field>
        <Field label="Статус">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Все</option>
            <option value="OPEN">{statusLabel.OPEN}</option>
            <option value="IN_PROGRESS">{statusLabel.IN_PROGRESS}</option>
            <option value="DONE">{statusLabel.DONE}</option>
            <option value="CANCELLED">{statusLabel.CANCELLED}</option>
          </Select>
        </Field>
        <Field label="Проект" className="min-w-44">
          <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="">Все</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      <ListCard>
        <DataTable
          rows={requests}
          columns={columns}
          getRowKey={(r) => r.id}
          renderCard={(r) => (
            <RowCard
              title={r.title}
              subtitle={projectName(r)}
              value={`${r.totalHours ?? 0} ч`}
              meta={
                <>
                  <Badge tone={priorityTone[r.priority]}>{priorityLabel[r.priority]}</Badge>
                  <MetaItem label="Статус">{statusLabel[r.status]}</MetaItem>
                </>
              }
              actions={
                <>
                  <div className="mr-auto">{statusSelect(r)}</div>
                  {canEdit && (
                    <>
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(r)}>
                        Изменить
                      </Button>
                      <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDelete(r)}>
                        Удалить
                      </Button>
                    </>
                  )}
                </>
              }
            />
          )}
          empty={
            <EmptyState
              icon={Inbox}
              title={hasFilters ? "Ничего не найдено" : "Заявок пока нет"}
              description={hasFilters ? "Попробуйте изменить поиск или фильтры." : "Заведите заявку по проекту, чтобы списывать на неё часы."}
              action={
                canEdit && !hasFilters ? (
                  <Button variant="primary" icon={Plus} onClick={startCreate}>
                    Новая заявка
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
        title={editingId ? "Редактирование заявки" : "Новая заявка"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="request-form" type="submit" loading={saving}>
              Сохранить
            </Button>
          </>
        }
      >
        <form id="request-form" onSubmit={handleSubmit} className="flex flex-col gap-3.5 pb-2">
          <Field label="Проект">
            <Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} required>
              <option value="">Выберите проект…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Название заявки">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </Field>

          <Field label="Приоритет">
            <Select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as RequestTicket["priority"] })}
            >
              <option value="LOW">{priorityLabel.LOW}</option>
              <option value="MEDIUM">{priorityLabel.MEDIUM}</option>
              <option value="HIGH">{priorityLabel.HIGH}</option>
            </Select>
          </Field>

          <Field label="Описание">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
