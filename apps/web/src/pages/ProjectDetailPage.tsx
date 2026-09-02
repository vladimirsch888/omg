import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CalendarCheck2,
  CalendarRange,
  CheckCircle2,
  Clock,
  CornerDownRight,
  RotateCcw,
  TrendingUp,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../api/client";
import { Operation, Project, RequestTicket } from "../api/types";
import {
  Badge,
  Button,
  Card,
  Column,
  DataTable,
  MetaItem,
  PageSkeleton,
  RowCard,
  StatCard,
  StatusBadge,
  useUi,
  type BadgeTone,
} from "../components/ui";
import { formatDate, formatMoney } from "../utils/format";

interface ProjectTimeline {
  startedAt: string | null;
  /** "planned" — дата начала заполнена в проекте, "activity" — выведена из работ. */
  startSource: "planned" | "activity" | null;
  finishedAt: string | null;
  isFinished: boolean;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  calendarDays: number | null;
  workingDays: number | null;
}

interface ProjectSummary {
  income: number;
  expense: number;
  profit: number;
  hours: number;
  includedProjectIds: string[];
  timeline: ProjectTimeline;
}

const projectStatusLabel: Record<Project["status"], string> = {
  ACTIVE: "В работе",
  PAUSED: "Приостановлен",
  CLOSED: "Завершён",
};

const projectStatusTone: Record<Project["status"], BadgeTone> = {
  ACTIVE: "income",
  PAUSED: "reserve",
  CLOSED: "neutral",
};

/** «5 дней» / «21 день» / «102 дня» */
function pluralDays(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

const requestStatusLabel: Record<RequestTicket["status"], string> = {
  OPEN: "Открыта",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};

const requestStatusTone: Record<RequestTicket["status"], BadgeTone> = {
  OPEN: "accent",
  IN_PROGRESS: "reserve",
  DONE: "income",
  CANCELLED: "neutral",
};

const priorityLabel: Record<RequestTicket["priority"], string> = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
};

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ui = useUi();
  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [requests, setRequests] = useState<RequestTicket[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get<Project>(`/projects/${id}`).then((res) => setProject(res.data));
    api.get<ProjectSummary>(`/projects/${id}/summary`).then((res) => setSummary(res.data));
    api.get(`/operations`, { params: { projectId: id, pageSize: 20 } }).then((res) => setOperations(res.data.items));
    api.get<RequestTicket[]>(`/requests`, { params: { projectId: id } }).then((res) => setRequests(res.data));
  }, [id]);

  if (!project || !summary) return <PageSkeleton stats={4} rows={5} />;

  const hasChildren = (project.children?.length ?? 0) > 0;
  const rollupHint = hasChildren ? "с учётом подпроектов" : undefined;

  const isFinished = project?.status === "CLOSED";

  /**
   * "Проект завершён" closes the project and stamps today as its end date, so
   * the actual duration below has a real endpoint. Reopening clears the date
   * again — an accidental close mustn't leave a fake completion date behind.
   */
  async function toggleFinished() {
    if (!project) return;
    const finishing = project.status !== "CLOSED";
    if (finishing) {
      const confirmed = await ui.confirm({
        title: `Завершить проект «${project.name}»?`,
        message: "Проект станет серым в списках, а сегодняшняя дата запишется как дата окончания работ. Это всегда можно отменить.",
        confirmLabel: "Завершить",
      });
      if (!confirmed) return;
    }
    try {
      await api.patch(`/projects/${project.id}`, {
        status: finishing ? "CLOSED" : "ACTIVE",
        endDate: finishing ? new Date().toISOString() : null,
      });
      ui.toast(finishing ? "Проект завершён" : "Проект снова в работе", "success");
      const [{ data: fresh }, { data: freshSummary }] = await Promise.all([
        api.get<Project>(`/projects/${project.id}`),
        api.get<ProjectSummary>(`/projects/${project.id}/summary`),
      ]);
      setProject(fresh);
      setSummary(freshSummary);
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось изменить статус проекта", "error");
    }
  }

  async function handleDelete() {
    const confirmed = await ui.confirm({
      title: `Удалить проект «${project!.name}»?`,
      message: hasChildren
        ? `Вместе с ним удалятся все подпроекты (${project!.children!.length}), их заявки и часы.`
        : "Его заявки и списанные часы также будут удалены.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/projects/${project!.id}`);
      ui.toast("Проект удалён", "success");
      navigate("/projects");
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось удалить проект", "error");
    }
  }

  const operationColumns: Column<Operation>[] = [
    { key: "date", header: "Дата", render: (o) => <span className="text-ink-muted">{formatDate(o.accrualDate)}</span> },
    {
      key: "category",
      header: "Категория",
      hideBelow: "md",
      render: (o) => <span className="text-ink-muted">{o.categoryValue?.name ?? "—"}</span>,
    },
    {
      key: "description",
      header: "Описание",
      render: (o) => <span className="text-ink">{o.description || (o.type === "INCOME" ? "Доход" : "Расход")}</span>,
    },
    {
      key: "amount",
      header: "Сумма",
      align: "right",
      render: (o) => (
        <span className={`font-medium ${o.type === "INCOME" ? "text-income" : "text-expense"}`}>
          {o.type === "INCOME" ? "+" : "−"}
          {formatMoney(o.amount)}
        </span>
      ),
    },
  ];

  const requestColumns: Column<RequestTicket>[] = [
    { key: "title", header: "Заявка", render: (r) => <span className="text-ink">{r.title}</span> },
    {
      key: "status",
      header: "Статус",
      render: (r) => <Badge tone={requestStatusTone[r.status]}>{requestStatusLabel[r.status]}</Badge>,
    },
    {
      key: "priority",
      header: "Приоритет",
      hideBelow: "md",
      render: (r) => <span className="text-ink-muted">{priorityLabel[r.priority]}</span>,
    },
    { key: "hours", header: "Часы", align: "right", render: (r) => <span className="text-ink-muted">{r.totalHours ?? 0} ч</span> },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-accent"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.8} />
            Все проекты
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1
              className={`text-xl font-semibold tracking-tight sm:text-2xl ${
                isFinished ? "text-ink-muted" : ""
              }`}
            >
              {project.name}
            </h1>
            <StatusBadge label={projectStatusLabel[project.status]} tone={projectStatusTone[project.status]} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Клиент:{" "}
            <Link to={`/clients/${project.clientId}`} className="text-ink transition-colors hover:text-accent">
              {project.client?.name}
            </Link>
            {project.parentId && " · подпроект"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isFinished ? "secondary" : "primary"}
            icon={isFinished ? RotateCcw : CheckCircle2}
            onClick={toggleFinished}
          >
            {isFinished ? "Вернуть в работу" : "Проект завершён"}
          </Button>
          <Button variant="danger" icon={Trash2} onClick={handleDelete}>
            Удалить
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Доход" value={formatMoney(summary.income)} tone="income" icon={ArrowUpRight} hint={rollupHint} />
        <StatCard label="Расход" value={formatMoney(summary.expense)} tone="expense" icon={ArrowDownRight} hint={rollupHint} />
        <StatCard label="Прибыль" value={formatMoney(summary.profit)} tone="accent" icon={TrendingUp} />
        <StatCard label="Часы" value={`${summary.hours} ч`} icon={Clock} hint={rollupHint} />
      </div>

      <Card
        title="Срок реализации"
        action={
          <span className="text-xs text-ink-subtle">
            {summary.timeline.isFinished ? "фактический" : "идёт сейчас"}
          </span>
        }
      >
        {summary.timeline.startedAt ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TimelineFact
                icon={CalendarRange}
                label="Начало работ"
                value={formatDate(summary.timeline.startedAt)}
                hint={
                  summary.timeline.startSource === "planned"
                    ? "дата начала из карточки проекта"
                    : "первая операция, заявка или списанные часы"
                }
              />
              <TimelineFact
                icon={CalendarCheck2}
                label={summary.timeline.isFinished ? "Завершение" : "Пока не завершён"}
                value={
                  summary.timeline.finishedAt ? formatDate(summary.timeline.finishedAt) : "в работе"
                }
                hint={
                  summary.timeline.isFinished
                    ? "дата окончания работ по проекту"
                    : "срок считается по сегодняшний день"
                }
                tone={summary.timeline.isFinished ? "neutral" : "accent"}
              />
              <TimelineFact
                icon={Clock}
                label={summary.timeline.isFinished ? "Фактический срок" : "Идёт уже"}
                value={`${summary.timeline.calendarDays} ${pluralDays(summary.timeline.calendarDays ?? 0)}`}
                hint={`${summary.timeline.workingDays} раб. дн. (без выходных)`}
                tone="accent"
              />
            </div>

            {summary.timeline.lastActivityAt && (
              <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-subtle">
                Последняя активность по проекту — {formatDate(summary.timeline.lastActivityAt)}.
                {hasChildren && " Срок считается с учётом подпроектов."}
              </p>
            )}
          </>
        ) : (
          <p className="py-4 text-center text-sm text-ink-subtle">
            По проекту ещё нет ни операций, ни заявок, ни списанных часов — считать срок не от чего.
          </p>
        )}
      </Card>

      {hasChildren && (
        <Card title="Подпроекты" action={<span className="text-xs text-ink-subtle">их деньги и часы включены выше</span>}>
          <ul className="flex flex-col gap-1.5">
            {project.children!.map((sp) => (
              <li key={sp.id}>
                <Link
                  to={`/projects/${sp.id}`}
                  className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-accent"
                >
                  <CornerDownRight className="size-3.5 text-ink-subtle" strokeWidth={1.8} />
                  {sp.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Последние операции">
        <DataTable
          rows={operations}
          columns={operationColumns}
          getRowKey={(o) => o.id}
          renderCard={(o) => (
            <RowCard
              title={o.description || (o.type === "INCOME" ? "Доход" : "Расход")}
              subtitle={o.categoryValue?.name}
              value={`${o.type === "INCOME" ? "+" : "−"}${formatMoney(o.amount)}`}
              valueTone={o.type === "INCOME" ? "income" : "expense"}
              meta={<MetaItem label="Дата">{formatDate(o.accrualDate)}</MetaItem>}
            />
          )}
          empty={<p className="py-4 text-center text-sm text-ink-subtle">Операций пока нет</p>}
        />
      </Card>

      <Card title="Заявки по проекту">
        <DataTable
          rows={requests}
          columns={requestColumns}
          getRowKey={(r) => r.id}
          renderCard={(r) => (
            <RowCard
              title={r.title}
              value={`${r.totalHours ?? 0} ч`}
              meta={
                <>
                  <Badge tone={requestStatusTone[r.status]}>{requestStatusLabel[r.status]}</Badge>
                  <MetaItem label="Приоритет">{priorityLabel[r.priority]}</MetaItem>
                </>
              }
            />
          )}
          empty={<p className="py-4 text-center text-sm text-ink-subtle">Заявок пока нет</p>}
        />
      </Card>
    </div>
  );
}

/** One fact in the timeline report: label, value, and where the value came from. */
function TimelineFact({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "accent";
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
          tone === "accent" ? "bg-accent-soft text-accent" : "bg-raised text-ink-muted"
        }`}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-muted">{label}</div>
        <div className="mt-0.5 text-base font-semibold text-ink tnum">{value}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-relaxed text-ink-subtle">{hint}</div>}
      </div>
    </div>
  );
}
