import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { User } from "../../api/types";
import { Card } from "../../components/Card";

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<User["role"]>("MANAGER");

  function load() {
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post("/users", { email, name, password, role });
    setEmail("");
    setName("");
    setPassword("");
    setShowForm(false);
    load();
  }

  async function toggleActive(id: string, isActive?: boolean) {
    await api.patch(`/users/${id}`, { isActive: !isActive });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Пользователи</h1>
        <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Отмена" : "+ Новый пользователь"}
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} required />
            <input type="email" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as User["role"])}>
              <option value="ADMIN">Администратор</option>
              <option value="MANAGER">Менеджер</option>
              <option value="VIEWER">Наблюдатель</option>
            </select>
            <button type="submit" className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Создать
            </button>
          </form>
        </Card>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Имя</th>
              <th className="py-2">Email</th>
              <th className="py-2">Роль</th>
              <th className="py-2">Активен</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-2">{u.name}</td>
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.role}</td>
                <td className="py-2">
                  <button onClick={() => toggleActive(u.id, u.isActive)} className={`rounded px-2 py-1 text-xs ${u.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {u.isActive ? "Да" : "Нет"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
