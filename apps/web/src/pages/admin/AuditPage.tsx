import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "../../api/client";
import { AuditEntry, Paged, User } from "../../api/types";
import {
  Badge,
  Column,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  ListCard,
  MetaItem,
  PageHeader,
  Pagination,
  RowCard,
  Select,
  type BadgeTone,
} from "../../components/ui";
import { formatDateTime } from "../../utils/format";

const entityLabel: Record<string, string> = {
  client: "Клиент",
  project: "Проект",
  operation: "Операция",
  request: "Заявка",
  timeEntry: "Учёт часов",
  licenseProduct: "Продукт",
  subscription: "Подписка",
  sale: "Продажа",
  salesPlan: "План продаж",
  user: "Пользователь",
  dictionaryType: "Справочник",
  dictionaryValue: "Справочник",
  demo: "Демо-данные",
};

const actionLabel: Record<string, { label: string; tone: BadgeTone }> = {
  create: { label: "создание", tone: "income" },
  update: { label: "изменение", tone: "accent" },
  delete: { label: "удаление", tone: "expense" },
  bill: { label: "продление", tone: "income" },
  login: { label: "вход", tone: "neutral" },
  seed: { label: "демо", tone: "reserve" },
  clear: { label: "демо", tone: "reserve" },
};

export function AuditPage() {
  const [data, setData] = useState<Paged<AuditEntry> | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [entity, setEntity] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }, []);

  useEffect(() => {
    api
      .get<Paged<AuditEntry>>("/audit", { params: { entity: entity || undefined, userId: userId || undefined, page, pageSize: 50 } })
      .then((res) => setData(res.data));
  }, [entity, userId, page]);

  const columns: Column<AuditEntry>[] = [
    { key: "when", header: "Когда", nowrap: true, render: (e) => <span className="text-ink-muted">{formatDateTime(e.createdAt)}</span> },
    { key: "who", header: "Кто", hideBelow: "md", render: (e) => <span className="text-ink-muted">{e.user?.name ?? "—"}</span> },
    {
      key: "what",
      header: "Что",
      render: (e) => (
        <span className="flex items-center gap-2">
          <Badge tone={actionLabel[e.action]?.tone ?? "neutral"}>{actionLabel[e.action]?.label ?? e.action}</Badge>
          <span className="text-ink-muted">{entityLabel[e.entity] ?? e.entity}</span>
        </span>
      ),
    },
    { key: "summary", header: "Описание", render: (e) => <span className="text-ink">{e.summary}</span> },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Журнал изменений"
        description="Кто, когда и что изменил: создания, правки, удаления, продления и входы в систему. Записи не удаляются вместе с объектами."
      />

      <FilterBar>
        <Field label="Объект">
          <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
            <option value="">Все</option>
            {Object.entries(entityLabel)
              .filter(([k]) => k !== "dictionaryValue")
              .map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
          </Select>
        </Field>
        <Field label="Пользователь">
          <Select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}>
            <option value="">Все</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      <ListCard>
        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          getRowKey={(e) => e.id}
          renderCard={(e) => (
            <RowCard
              title={e.summary}
              subtitle={`${entityLabel[e.entity] ?? e.entity} · ${e.user?.name ?? "—"}`}
              meta={
                <>
                  <Badge tone={actionLabel[e.action]?.tone ?? "neutral"}>{actionLabel[e.action]?.label ?? e.action}</Badge>
                  <MetaItem label="Когда">{formatDateTime(e.createdAt)}</MetaItem>
                </>
              }
            />
          )}
          empty={<EmptyState icon={History} title="Записей пока нет" description="Журнал заполняется по мере работы в системе." />}
        />
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </ListCard>
    </div>
  );
}
