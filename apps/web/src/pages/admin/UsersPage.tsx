import { FormEvent, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { User } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import {
  Button,
  Card,
  Column,
  DataTable,
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
} from "../../components/ui";

const roleLabel: Record<User["role"], string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  VIEWER: "Наблюдатель",
};

const roleHint: Record<User["role"], string> = {
  OWNER: "всё, включая владельцев",
  ADMIN: "всё, кроме назначения владельцев",
  MANAGER: "работа с данными без администрирования",
  VIEWER: "только просмотр",
};

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: User["role"];
}

export function UsersPage() {
  const ui = useUi();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>({ name: "", email: "", password: "", role: "MANAGER" });

  const iAmOwner = me?.role === "OWNER";

  function load() {
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }

  useEffect(load, []);

  function startCreate() {
    setForm({ name: "", email: "", password: "", role: "MANAGER" });
    setEditingId(null);
    setFormOpen(true);
  }

  function startEdit(u: User) {
    setForm({ name: u.name, email: u.email, password: "", role: u.role });
    setEditingId(u.id);
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/users/${editingId}`, {
          name: form.name,
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        });
        ui.toast(form.password ? "Пользователь обновлён, пароль сменён" : "Пользователь обновлён", "success");
      } else {
        await api.post("/users", form);
        ui.toast("Пользователь создан", "success");
      }
      setFormOpen(false);
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось сохранить пользователя"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: User) {
    try {
      await api.patch(`/users/${u.id}`, { isActive: !u.isActive });
      ui.toast(u.isActive ? `${u.name}: доступ отключён` : `${u.name}: доступ включён`, "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось изменить доступ"), "error");
    }
  }

  const isSelf = (u: User) => u.id === me?.id;
  const canTouch = (u: User) => !isSelf(u) && (iAmOwner || u.role !== "OWNER");

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Имя",
      render: (u) => (
        <span className="font-medium text-ink">
          {u.name}
          {isSelf(u) && <span className="ml-1.5 text-xs font-normal text-ink-subtle">(это вы)</span>}
        </span>
      ),
    },
    { key: "email", header: "Email", render: (u) => <span className="text-ink-muted">{u.email}</span> },
    { key: "role", header: "Роль", render: (u) => <span className="text-ink-muted">{roleLabel[u.role]}</span> },
    {
      key: "active",
      header: "Доступ",
      render: (u) => (
        <button
          onClick={() => toggleActive(u)}
          disabled={!canTouch(u)}
          title={!canTouch(u) ? "Нельзя изменить" : u.isActive ? "Отключить доступ" : "Включить доступ"}
          className="-my-1.5 inline-flex min-h-9 cursor-pointer items-center py-1.5 disabled:cursor-default disabled:opacity-60"
        >
          <StatusBadge label={u.isActive ? "Активен" : "Отключён"} tone={u.isActive ? "income" : "neutral"} />
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (u) => (canTouch(u) ? <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(u)} /> : null),
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Пользователи"
        description="Владелец и администраторы управляют системой, менеджер работает с данными, наблюдатель только смотрит. Смена роли, пароля или отключение доступа действуют сразу — пользователь будет разлогинен."
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
              title={isSelf(u) ? `${u.name} (это вы)` : u.name}
              subtitle={u.email}
              meta={
                <>
                  <MetaItem label="Роль">{roleLabel[u.role]}</MetaItem>
                  <StatusBadge label={u.isActive ? "Активен" : "Отключён"} tone={u.isActive ? "income" : "neutral"} />
                </>
              }
              actions={
                canTouch(u) && (
                  <>
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(u)}>
                      Изменить
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>
                      {u.isActive ? "Отключить" : "Включить"}
                    </Button>
                  </>
                )
              }
            />
          )}
        />
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? "Редактирование пользователя" : "Новый пользователь"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="user-form" type="submit" loading={saving}>
              {editingId ? "Сохранить" : "Создать"}
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="flex flex-col gap-3.5 pb-2">
          <Field label="Имя">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
          </Field>
          <Field label="Email" hint={editingId ? "Email изменить нельзя" : undefined}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={Boolean(editingId)} />
          </Field>
          <Field
            label={editingId ? "Новый пароль" : "Пароль"}
            hint={editingId ? "Оставьте пустым, чтобы не менять. Смена пароля завершит сессии пользователя" : "Не короче 8 символов, не только цифры"}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!editingId}
              minLength={8}
            />
          </Field>
          <Field label="Роль" hint={roleHint[form.role]}>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as User["role"] })}>
              {iAmOwner && <option value="OWNER">{roleLabel.OWNER}</option>}
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
