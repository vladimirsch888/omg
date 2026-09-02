import { FormEvent, useEffect, useMemo, useState } from "react";
import { Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { Project, RequestTicket, TimeEntry } from "../api/types";
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
  StatCard,
  useUi,
} from "../components/ui";
import { formatDate, toDateInputValue } from "../utils/format";

const emptyForm = {
  projectId: "",
  requestId: "",
  date: new Date().toISOString().slice(0, 10),
  hours: "",
  description: "",
};

export function TimeTrackingPage() {
  const ui = useUi();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<RequestTicket[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api.get<TimeEntry[]>("/time-entries").then((res) => setEntries(res.data));
  }

  useEffect(() => {
    load();
    api.get<Project[]>("/projects").then((res) => setProjects(res.data.flatMap((p) => [p, ...(p.children ?? [])])));
    api.get<RequestTicket[]>("/requests").then((res) => setRequests(res.data));
  }, []);

  const requestsForProject = requests.filter((r) => r.projectId === form.projectId);

  const { monthHours, totalHours } = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    let month = 0;
    let total = 0;
    for (const e of entries) {
      const hours = Number(e.hours);
      total += hours;
      if (new Date(e.date) >= monthStart) month += hours;
    }
    return { monthHours: month, totalHours: total };
  }, [entries]);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
  }

  function startEdit(entry: TimeEntry) {
    setForm({
      projectId: entry.projectId,
      requestId: entry.requestId ?? "",
      date: toDateInputValue(entry.date),
      hours: String(entry.hours),
      description: entry.description ?? "",
    });
    setEditingId(entry.id);
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      projectId: form.projectId,
      requestId: form.requestId || undefined,
      date: new Date(form.date).toISOString(),
      hours: Number(form.hours),
      description: form.description || undefined,
    };
    try {
      if (editingId) {
        await api.patch(`/time-entries/${editingId}`, payload);
        ui.toast("Запись обновлена", "success");
      } else {
        await api.post("/time-entries", payload);
        ui.toast("Время записано", "success");
      }
      setFormOpen(false);
      setEditingId(null);
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось сохранить запись", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: TimeEntry) {
    const confirmed = await ui.confirm({
      title: "Удалить запись времени?",
      message: `${entry.hours} ч от ${formatDate(entry.date)}${entry.project?.name ? ` — ${entry.project.name}` : ""}.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/time-entries/${entry.id}`);
      ui.toast("Запись удалена", "success");
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось удалить запись", "error");
    }
  }

  const columns: Column<TimeEntry>[] = [
    { key: "date", header: "Дата", render: (e) => <span className="text-ink-muted">{formatDate(e.date)}</span> },
    { key: "project", header: "Проект", render: (e) => <span className="font-medium text-ink">{e.project?.name}</span> },
    { key: "request", header: "Заявка", hideBelow: "md", render: (e) => <span className="text-ink-muted">{e.request?.title ?? "—"}</span> },
    { key: "user", header: "Сотрудник", hideBelow: "lg", render: (e) => <span className="text-ink-muted">{e.user?.name}</span> },
    { key: "hours", header: "Часы", align: "right", render: (e) => <span className="font-medium text-ink">{e.hours} ч</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (e) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(e)} />
          <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(e)} className="hover:text-expense" />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Учёт часов"
        description="Списанное время по проектам и заявкам — основа для оценки реальной себестоимости работ."
        actions={
          <Button variant="primary" icon={Plus} onClick={startCreate}>
            Записать время
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard label="Часов в этом месяце" value={`${monthHours} ч`} tone="accent" icon={Clock} />
        <StatCard label="Всего записано" value={`${totalHours} ч`} icon={Clock} />
      </div>

      <ListCard>
        <DataTable
          rows={entries}
          columns={columns}
          getRowKey={(e) => e.id}
          renderCard={(e) => (
            <RowCard
              title={e.project?.name ?? "—"}
              subtitle={e.request?.title ?? e.description ?? undefined}
              value={`${e.hours} ч`}
              meta={
                <>
                  <MetaItem label="Дата">{formatDate(e.date)}</MetaItem>
                  {e.user?.name && <MetaItem label="Кто">{e.user.name}</MetaItem>}
                </>
              }
              actions={
                <>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(e)}>
                    Изменить
                  </Button>
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDelete(e)}>
                    Удалить
                  </Button>
                </>
              }
            />
          )}
          empty={
            <EmptyState
              icon={Clock}
              title="Записей пока нет"
              description="Запишите первые часы по проекту или заявке."
              action={
                <Button variant="primary" icon={Plus} onClick={startCreate}>
                  Записать время
                </Button>
              }
            />
          }
        />
      </ListCard>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? "Редактирование записи" : "Запись времени"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="time-form" type="submit" loading={saving}>
              Сохранить
            </Button>
          </>
        }
      >
        <form id="time-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-3.5 pb-2 sm:grid-cols-2">
          <Field label="Проект" className="sm:col-span-2">
            <Select
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value, requestId: "" })}
              required
            >
              <option value="">Выберите проект…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Заявка" className="sm:col-span-2">
            <Select
              value={form.requestId}
              onChange={(e) => setForm({ ...form, requestId: e.target.value })}
              disabled={!form.projectId}
            >
              <option value="">Без привязки к заявке</option>
              {requestsForProject.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Дата">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>

          <Field label="Часы">
            <Input
              type="number"
              step="0.25"
              inputMode="decimal"
              value={form.hours}
              onChange={(e) => setForm({ ...form, hours: e.target.value })}
              required
            />
          </Field>

          <Field label="Описание работ" className="sm:col-span-2">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
