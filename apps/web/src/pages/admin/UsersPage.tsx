import { FormEvent, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../../api/client";
import { User } from "../../api/types";
import {
  Button,
  Card,
  Column,
  DataTable,
  Field,
  Input,
  MetaItem,
  Modal,
  PageHeader,
  RowCard,
  Select,
  StatusBadge,
  useUi,
} from "../../components/ui";

const roleLabel: Record<User["role"], string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  VIEWER: "Наблюдатель",
};

export function UsersPage() {
  const ui = useUi();
  const [users, setUsers] = useState<User[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<User["role"]>("MANAGER");

  function load() {
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }

  useEffect(load, []);

  function startCreate() {
    setEmail("");
    setName("");
    setPassword("");
    setRole("MANAGER");
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/users", { email, name, password, role });
      ui.toast("Пользователь создан", "success");
      setFormOpen(false);
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось создать пользователя", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, isActive?: boolean) {
    await api.patch(`/users/${id}`, { isActive: !isActive });
    load();
  }

  const columns: Column<User>[] = [
    { key: "name", header: "Имя", render: (u) => <span className="font-medium text-ink">{u.name}</span> },
    { key: "email", header: "Email", render: (u) => <span className="text-ink-muted">{u.email}</span> },
    { key: "role", header: "Роль", render: (u) => <span className="text-ink-muted">{roleLabel[u.role]}</span> },
    {
      key: "active",
      header: "Активен",
      render: (u) => (
        <button onClick={() => toggleActive(u.id, u.isActive)} className="cursor-pointer">
          <StatusBadge label={u.isActive ? "Да" : "Нет"} tone={u.isActive ? "income" : "neutral"} />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Пользователи"
        description="Владелец и администраторы видят всё, менеджер работает с данными, наблюдатель — только читает."
        actions={
          <Button variant="primary" icon={Plus} onClick={startCreate}>
            Новый пользователь
          </Button>
        }
      />

      <Card bodyClassName="sm:pt-4">
        <DataTable
          rows={users}
          columns={columns}
          getRowKey={(u) => u.id}
          renderCard={(u) => (
            <RowCard
              title={u.name}
              subtitle={u.email}
              meta={
                <>
                  <MetaItem label="Роль">{roleLabel[u.role]}</MetaItem>
                  <StatusBadge label={u.isActive ? "Активен" : "Отключён"} tone={u.isActive ? "income" : "neutral"} />
                </>
              }
              actions={
                <Button size="sm" variant="ghost" onClick={() => toggleActive(u.id, u.isActive)}>
                  {u.isActive ? "Отключить" : "Включить"}
                </Button>
              }
            />
          )}
        />
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Новый пользователь"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="user-form" type="submit" loading={saving}>
              Создать
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="flex flex-col gap-3.5 pb-2">
          <Field label="Имя">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Пароль" hint="Минимум 6 символов">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </Field>
          <Field label="Роль">
            <Select value={role} onChange={(e) => setRole(e.target.value as User["role"])}>
              <option value="ADMIN">{roleLabel.ADMIN}</option>
              <option value="MANAGER">{roleLabel.MANAGER}</option>
              <option value="VIEWER">{roleLabel.VIEWER}</option>
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
