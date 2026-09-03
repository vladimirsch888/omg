import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CornerDownRight, FolderKanban, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { Client, DictionaryType, Project } from "../api/types";
import { useAuth } from "../context/AuthContext";
import {
  Button,
  Card,
  EmptyState,
  Field,
  FilterBar,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  useUi,
  type BadgeTone,
} from "../components/ui";
import { dateInputToIso, toDateInputValue } from "../utils/format";

const statusLabel: Record<Project["status"], string> = {
  ACTIVE: "В работе",
  PAUSED: "Приостановлен",
  CLOSED: "Завершён",
};

const statusTone: Record<Project["status"], BadgeTone> = {
  ACTIVE: "income",
  PAUSED: "reserve",
  CLOSED: "neutral",
};

interface ProjectForm {
  name: string;
  clientId: string;
  parentId: string;
  typeValueId: string;
  status: Project["status"];
  description: string;
  startDate: string;
  hourlyRate: string;
  budgetHours: string;
}

const emptyForm: ProjectForm = {
  name: "",
  clientId: "",
  parentId: "",
  typeValueId: "",
  status: "ACTIVE",
  description: "",
  startDate: "",
  hourlyRate: "",
  budgetHours: "",
};

export function ProjectsPage() {
  const ui = useUi();
  const { canEdit } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projectTypes, setProjectTypes] = useState<DictionaryType | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);

  function load() {
    api
      .get<Project[]>("/projects", { params: { status: statusFilter || undefined, clientId: clientFilter || undefined } })
      .then((res) => setProjects(res.data));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, clientFilter]);

  useEffect(() => {
    api.get<Client[]>("/clients").then((res) => setClients(res.data));
    api.get<DictionaryType[]>("/dictionaries").then((res) => {
      setProjectTypes(res.data.find((d) => d.code === "project_type") ?? null);
    });
  }, []);

  const topLevelProjectsForClient = projects.filter((p) => p.clientId === form.clientId && p.id !== editingId);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
  }

  function startEdit(p: Project) {
    setForm({
      name: p.name,
      clientId: p.clientId,
      parentId: p.parentId ?? "",
      typeValueId: p.typeValueId ?? "",
      status: p.status,
      description: p.description ?? "",
      startDate: toDateInputValue(p.startDate),
      hourlyRate: p.hourlyRate != null ? String(p.hourlyRate) : "",
      budgetHours: p.budgetHours != null ? String(p.budgetHours) : "",
    });
    setEditingId(p.id);
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      clientId: form.clientId,
      parentId: form.parentId || null,
      typeValueId: form.typeValueId || null,
      status: form.status,
      description: form.description || null,
      startDate: form.startDate ? dateInputToIso(form.startDate) : null,
      hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
      budgetHours: form.budgetHours ? Number(form.budgetHours) : null,
    };
    try {
      if (editingId) {
        await api.patch(`/projects/${editingId}`, payload);
        ui.toast("Проект обновлён", "success");
      } else {
        await api.post("/projects", payload);
        ui.toast("Проект создан", "success");
      }
      setFormOpen(false);
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось сохранить проект"), "error");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Marks the project finished (or puts it back to work). Closing stamps
   * today as the end date so the project's report has a real endpoint;
   * reopening clears it rather than leaving a false completion date.
   */
  async function toggleFinished(p: Project) {
    const finishing = p.status !== "CLOSED";
    try {
      await api.patch(`/projects/${p.id}`, {
        status: finishing ? "CLOSED" : "ACTIVE",
        endDate: finishing ? new Date().toISOString() : null,
      });
      ui.toast(finishing ? `Проект «${p.name}» завершён` : `Проект «${p.name}» снова в работе`, "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось изменить статус проекта"), "error");
    }
  }

  async function handleDelete(p: Project) {
    const confirmed = await ui.confirm({
      title: `Удалить проект «${p.name}»?`,
      message:
        p.children && p.children.length > 0
          ? `Вместе с ним удалятся все подпроекты (${p.children.length}), их заявки и часы. Проведённые операции останутся, но потеряют привязку к проекту.`
          : "Его заявки и списанные часы также будут удалены. Проведённые операции останутся, но потеряют привязку к проекту.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/projects/${p.id}`);
      ui.toast("Проект удалён", "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось удалить проект"), "error");
    }
  }

  const hasFilters = Boolean(statusFilter || clientFilter);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Проекты"
        description="Проекты и подпроекты клиентов. Часы и заявки списываются на конкретный проект, а выручка сворачивается вверх по дереву."
        actions={
          canEdit && (
            <Button variant="primary" icon={Plus} onClick={startCreate}>
              Новый проект
            </Button>
          )
        }
      />

      <FilterBar>
        <Field label="Клиент" className="min-w-48">
          <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">Все клиенты</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Статус">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Все</option>
            <option value="ACTIVE">{statusLabel.ACTIVE}</option>
            <option value="PAUSED">{statusLabel.PAUSED}</option>
            <option value="CLOSED">{statusLabel.CLOSED}</option>
          </Select>
        </Field>
      </FilterBar>

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title={hasFilters ? "Ничего не найдено" : "Проектов пока нет"}
            description={hasFilters ? "Попробуйте изменить фильтр." : "Создайте проект для клиента — внутри можно завести подпроекты."}
            action={
              canEdit && !hasFilters ? (
                <Button variant="primary" icon={Plus} onClick={startCreate}>
                  Новый проект
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.map((p) => (
            <Card key={p.id} bodyClassName="p-3.5 sm:p-4" className={p.status === "CLOSED" ? "opacity-70" : ""}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/projects/${p.id}`}
                    className={`-my-1.5 inline-flex min-h-10 items-center py-1.5 text-sm font-medium transition-colors hover:text-accent ${
                      p.status === "CLOSED" ? "text-ink-muted" : "text-ink"
                    }`}
                  >
                    {p.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <span>{p.client?.name}</span>
                    <StatusBadge label={statusLabel[p.status]} tone={statusTone[p.status]} />
                    {p.typeValue?.name && <span className="text-ink-subtle">{p.typeValue.name}</span>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(p)} />
                    <IconButton
                      icon={p.status === "CLOSED" ? RotateCcw : CheckCircle2}
                      label={p.status === "CLOSED" ? "Вернуть в работу" : "Проект завершён"}
                      onClick={() => toggleFinished(p)}
                      className="hover:text-income"
                    />
                    <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(p)} className="hover:text-expense" />
                  </div>
                )}
              </div>

              {p.children && p.children.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5 border-l border-line pl-3">
                  {p.children.map((sp) => (
                    <li key={sp.id} className="flex items-center justify-between gap-3">
                      <Link
                        to={`/projects/${sp.id}`}
                        className={`inline-flex min-h-9 min-w-0 items-center gap-1.5 text-sm transition-colors hover:text-accent ${
                          sp.status === "CLOSED" ? "text-ink-subtle line-through decoration-line-strong" : "text-ink-muted"
                        }`}
                      >
                        <CornerDownRight className="size-3.5 shrink-0 text-ink-subtle" strokeWidth={1.8} />
                        <span className="truncate">{sp.name}</span>
                      </Link>
                      {canEdit && (
                        <span className="flex shrink-0 items-center gap-1">
                          <IconButton icon={Pencil} label="Редактировать подпроект" onClick={() => startEdit(sp)} />
                          <IconButton
                            icon={sp.status === "CLOSED" ? RotateCcw : CheckCircle2}
                            label={sp.status === "CLOSED" ? "Вернуть в работу" : "Подпроект завершён"}
                            onClick={() => toggleFinished(sp)}
                            className="hover:text-income"
                          />
                          <IconButton
                            icon={Trash2}
                            label="Удалить подпроект"
                            onClick={() => handleDelete(sp)}
                            className="hover:text-expense"
                          />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? "Редактирование проекта" : "Новый проект"}
        description="Чтобы создать подпроект, выберите клиента и укажите родительский проект. Ставка и бюджет часов дают план/факт по трудозатратам в карточке проекта."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="project-form" type="submit" loading={saving}>
              {editingId ? "Сохранить" : "Создать"}
            </Button>
          </>
        }
      >
        <form id="project-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-3.5 pb-2 sm:grid-cols-2">
          <Field label="Клиент">
            <Select
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value, parentId: "" })}
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

          <Field label="Родительский проект">
            <Select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} disabled={!form.clientId}>
              <option value="">Без родителя (проект верхнего уровня)</option>
              {topLevelProjectsForClient.map((p) => (
                <option key={p.id} value={p.id}>
                  Подпроект в «{p.name}»
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Название" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>

          <Field label="Тип проекта">
            <Select value={form.typeValueId} onChange={(e) => setForm({ ...form, typeValueId: e.target.value })}>
              <option value="">Без типа</option>
              {projectTypes?.values.filter((v) => v.isActive || v.id === form.typeValueId).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Статус">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Project["status"] })}>
              <option value="ACTIVE">{statusLabel.ACTIVE}</option>
              <option value="PAUSED">{statusLabel.PAUSED}</option>
              <option value="CLOSED">{statusLabel.CLOSED}</option>
            </Select>
          </Field>

          <Field label="Дата начала работ" hint="Если не заполнять, возьмётся первое событие по проекту">
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>

          <Field label="Ставка, ₽ за час" hint="Для расчёта стоимости списанных часов">
            <Input type="number" min="0" step="1" inputMode="numeric" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
          </Field>

          <Field label="Бюджет часов" hint="Плановые трудозатраты — сравниваются с фактом">
            <Input type="number" min="0" step="0.5" inputMode="decimal" value={form.budgetHours} onChange={(e) => setForm({ ...form, budgetHours: e.target.value })} />
          </Field>

          <Field label="Описание" className="sm:col-span-2">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
