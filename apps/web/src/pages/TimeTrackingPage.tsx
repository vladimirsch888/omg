import { FormEvent, useEffect, useState } from "react";
import { Clock, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { Paged, Project, RequestTicket, TimeEntry, User } from "../api/types";
import { useAuth } from "../context/AuthContext";
import {
  Button,
  ListCard,
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
  StatCard,
  useUi,
} from "../components/ui";
import { dateInputToIso, downloadFile, formatDate, formatHours, monthsAgoInput, todayInput, toDateInputValue } from "../utils/format";

interface TimeForm {
  projectId: string;
  requestId: string;
  date: string;
  hours: string;
  description: string;
}

function emptyForm(): TimeForm {
  return { projectId: "", requestId: "", date: todayInput(), hours: "", description: "" };
}

type TimeEntriesPage = Paged<TimeEntry> & { totalHours: number };

const PAGE_SIZE = 50;

export function TimeTrackingPage() {
  const ui = useUi();
  const { canEdit, isAdmin, user } = useAuth();
  const [data, setData] = useState<TimeEntriesPage | null>(null);
  const [monthHours, setMonthHours] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<RequestTicket[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TimeForm>(emptyForm);
  const [projectFilter, setProjectFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const filterParams = {
    projectId: projectFilter || undefined,
    userId: userFilter || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  function load() {
    api
      .get<TimeEntriesPage>("/time-entries", { params: { ...filterParams, page, pageSize: PAGE_SIZE } })
      .then((res) => setData(res.data));
    // The month total is a separate, unfiltered query — the KPI must not
    // change when the list is filtered.
    api
      .get<TimeEntriesPage>("/time-entries", { params: { from: monthsAgoInput(0), pageSize: 1 } })
      .then((res) => setMonthHours(res.data.totalHours));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter, userFilter, from, to, page]);

  useEffect(() => {
    api.get<Project[]>("/projects").then((res) => setProjects(res.data.flatMap((p) => [p, ...(p.children ?? [])])));
    api.get<RequestTicket[]>("/requests").then((res) => setRequests(res.data));
    if (isAdmin) api.get<User[]>("/users").then((res) => setUsers(res.data));
  }, [isAdmin]);

  const requestsForProject = requests.filter((r) => r.projectId === form.projectId);

  function startCreate() {
    setForm(emptyForm());
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
      requestId: form.requestId || null,
      date: dateInputToIso(form.date),
      hours: Number(form.hours.replace(",", ".")),
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
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось сохранить запись"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: TimeEntry) {
    const confirmed = await ui.confirm({
      title: "Удалить запись времени?",
      message: `${formatHours(entry.hours)} от ${formatDate(entry.date)}${entry.project?.name ? ` — ${entry.project.name}` : ""}.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/time-entries/${entry.id}`);
      ui.toast("Запись удалена", "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось удалить запись"), "error");
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const qs = new URLSearchParams(Object.entries(filterParams).filter(([, v]) => v) as [string, string][]);
      await downloadFile(`/api/export/time-entries.csv?${qs}`, "учёт-часов.csv");
    } catch (err) {
      ui.toast((err as Error).message, "error");
    } finally {
      setExporting(false);
    }
  }

  const canTouch = (e: TimeEntry) => canEdit && (isAdmin || e.userId === user?.id);

  const columns: Column<TimeEntry>[] = [
    { key: "date", header: "Дата", nowrap: true, render: (e) => <span className="text-ink-muted">{formatDate(e.date)}</span> },
    { key: "project", header: "Проект", render: (e) => <span className="font-medium text-ink">{e.project?.name}</span> },
    { key: "request", header: "Заявка", hideBelow: "md", render: (e) => <span className="text-ink-muted">{e.request?.title ?? "—"}</span> },
    { key: "user", header: "Сотрудник", hideBelow: "lg", render: (e) => <span className="text-ink-muted">{e.user?.name}</span> },
    { key: "hours", header: "Часы", align: "right", render: (e) => <span className="font-medium text-ink">{formatHours(e.hours)}</span> },
    ...(canEdit
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            render: (e: TimeEntry) =>
              canTouch(e) ? (
                <div className="flex items-center justify-end gap-1">
                  <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(e)} />
                  <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(e)} className="hover:text-expense" />
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  const hasFilters = Boolean(projectFilter || userFilter || from || to);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Учёт часов"
        description="Списанное время по проектам и заявкам — основа для оценки реальной себестоимости работ."
        actions={
          <>
            <ExportButton onClick={handleExport} loading={exporting} />
            {canEdit && (
              <Button variant="primary" icon={Plus} onClick={startCreate}>
                Записать время
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard label="Часов в этом месяце" value={monthHours === null ? "…" : formatHours(monthHours)} tone="accent" icon={Clock} />
        <StatCard
          label={hasFilters ? "Часов по фильтру" : "Всего записано"}
          value={data ? formatHours(data.totalHours) : "…"}
          icon={Clock}
          hint={data ? `${data.total} записей` : undefined}
        />
      </div>

      <FilterBar>
        <Field label="Проект" className="min-w-44">
          <Select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setPage(1); }}>
            <option value="">Все</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        {isAdmin && (
          <Field label="Сотрудник">
            <Select value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(1); }}>
              <option value="">Все</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Период с">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </Field>
        <Field label="по">
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </Field>
        {hasFilters && (
          <Button variant="ghost" icon={X} onClick={() => { setProjectFilter(""); setUserFilter(""); setFrom(""); setTo(""); setPage(1); }}>
            Сбросить
          </Button>
        )}
      </FilterBar>

      <ListCard>
        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          getRowKey={(e) => e.id}
          renderCard={(e) => (
            <RowCard
              title={e.project?.name ?? "—"}
              subtitle={e.request?.title ?? e.description ?? undefined}
              value={formatHours(e.hours)}
              meta={
                <>
                  <MetaItem label="Дата">{formatDate(e.date)}</MetaItem>
                  {e.user?.name && <MetaItem label="Кто">{e.user.name}</MetaItem>}
                </>
              }
              actions={
                canTouch(e) && (
                  <>
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(e)}>
                      Изменить
                    </Button>
                    <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDelete(e)}>
                      Удалить
                    </Button>
                  </>
                )
              }
            />
          )}
          empty={
            <EmptyState
              icon={Clock}
              title={hasFilters ? "Ничего не найдено" : "Записей пока нет"}
              description={hasFilters ? "Попробуйте изменить фильтры." : "Запишите первые часы по проекту или заявке."}
              action={
                canEdit && !hasFilters ? (
                  <Button variant="primary" icon={Plus} onClick={startCreate}>
                    Записать время
                  </Button>
                ) : undefined
              }
            />
          }
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
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
              min="0.25"
              max="24"
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
