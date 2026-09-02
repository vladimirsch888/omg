import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Clock, CornerDownRight, TrendingUp, Trash2 } from "lucide-react";
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
  useUi,
  type BadgeTone,
} from "../components/ui";
import { formatDate, formatMoney } from "../utils/format";

interface ProjectSummary {
  income: number;
  expense: number;
  profit: number;
  hours: number;
  includedProjectIds: string[];
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
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{project.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Клиент:{" "}
            <Link to={`/clients/${project.clientId}`} className="text-ink transition-colors hover:text-accent">
              {project.client?.name}
            </Link>
            {project.parentId && " · подпроект"}
          </p>
        </div>
        <Button variant="danger" icon={Trash2} onClick={handleDelete}>
          Удалить проект
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Доход" value={formatMoney(summary.income)} tone="income" icon={ArrowUpRight} hint={rollupHint} />
        <StatCard label="Расход" value={formatMoney(summary.expense)} tone="expense" icon={ArrowDownRight} hint={rollupHint} />
        <StatCard label="Прибыль" value={formatMoney(summary.profit)} tone="accent" icon={TrendingUp} />
        <StatCard label="Часы" value={`${summary.hours} ч`} icon={Clock} hint={rollupHint} />
      </div>

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
