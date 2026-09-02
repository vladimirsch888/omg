import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CornerDownRight, FolderKanban, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { Client, DictionaryType, Project } from "../api/types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  useUi,
  type BadgeTone,
} from "../components/ui";

const statusLabel: Record<Project["status"], string> = {
  ACTIVE: "Активен",
  PAUSED: "Приостановлен",
  CLOSED: "Закрыт",
};

const statusTone: Record<Project["status"], BadgeTone> = {
  ACTIVE: "income",
  PAUSED: "reserve",
  CLOSED: "neutral",
};

export function ProjectsPage() {
  const ui = useUi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projectTypes, setProjectTypes] = useState<DictionaryType | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [parentId, setParentId] = useState("");
  const [typeValueId, setTypeValueId] = useState("");

  function load() {
    api.get<Project[]>("/projects").then((res) => setProjects(res.data));
  }

  useEffect(() => {
    load();
    api.get<Client[]>("/clients").then((res) => setClients(res.data));
    api.get<DictionaryType[]>("/dictionaries").then((res) => {
      setProjectTypes(res.data.find((d) => d.code === "project_type") ?? null);
    });
  }, []);

  const topLevelProjectsForClient = projects.filter((p) => p.clientId === clientId);

  function startCreate() {
    setName("");
    setClientId("");
    setParentId("");
    setTypeValueId("");
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/projects", {
        name,
        clientId,
        parentId: parentId || undefined,
        typeValueId: typeValueId || undefined,
      });
      ui.toast("Проект создан", "success");
      setFormOpen(false);
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось создать проект", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Project) {
    const confirmed = await ui.confirm({
      title: `Удалить проект «${p.name}»?`,
      message:
        p.children && p.children.length > 0
          ? `Вместе с ним удалятся все подпроекты (${p.children.length}), их заявки и часы.`
          : "Его заявки и списанные часы также будут удалены.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/projects/${p.id}`);
      ui.toast("Проект удалён", "success");
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось удалить проект", "error");
    }
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Проекты"
        description="Проекты и подпроекты клиентов. Часы и заявки списываются на конкретный проект, а выручка сворачивается вверх по дереву."
        actions={
          <Button variant="primary" icon={Plus} onClick={startCreate}>
            Новый проект
          </Button>
        }
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="Проектов пока нет"
            description="Создайте проект для клиента — внутри можно завести подпроекты."
            action={
              <Button variant="primary" icon={Plus} onClick={startCreate}>
                Новый проект
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.map((p) => (
            <Card key={p.id} bodyClassName="p-3.5 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/projects/${p.id}`} className="text-sm font-medium text-ink transition-colors hover:text-accent">
                    {p.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <span>{p.client?.name}</span>
                    <StatusBadge label={statusLabel[p.status]} tone={statusTone[p.status]} />
                    {p.typeValue?.name && <span className="text-ink-subtle">{p.typeValue.name}</span>}
                  </div>
                </div>
                <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(p)} className="hover:text-expense" />
              </div>

              {p.children && p.children.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5 border-l border-line pl-3">
                  {p.children.map((sp) => (
                    <li key={sp.id} className="flex items-center justify-between gap-3">
                      <Link
                        to={`/projects/${sp.id}`}
                        className="inline-flex min-w-0 items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-accent"
                      >
                        <CornerDownRight className="size-3.5 shrink-0 text-ink-subtle" strokeWidth={1.8} />
                        <span className="truncate">{sp.name}</span>
                      </Link>
                      <IconButton
                        icon={Trash2}
                        label="Удалить подпроект"
                        onClick={() => handleDelete(sp)}
                        className="hover:text-expense"
                      />
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
        title="Новый проект"
        description="Чтобы создать подпроект, выберите клиента и укажите родительский проект."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="project-form" type="submit" loading={saving}>
              Создать
            </Button>
          </>
        }
      >
        <form id="project-form" onSubmit={handleSubmit} className="flex flex-col gap-3.5 pb-2">
          <Field label="Клиент">
            <Select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setParentId("");
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

          <Field label="Родительский проект">
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={!clientId}>
              <option value="">Без родителя (проект верхнего уровня)</option>
              {topLevelProjectsForClient.map((p) => (
                <option key={p.id} value={p.id}>
                  Подпроект в «{p.name}»
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>

          <Field label="Тип проекта">
            <Select value={typeValueId} onChange={(e) => setTypeValueId(e.target.value)}>
              <option value="">Без типа</option>
              {projectTypes?.values.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
