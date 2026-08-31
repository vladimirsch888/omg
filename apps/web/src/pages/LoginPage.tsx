import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(organizationName, name, email, password);
      }
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Ошибка. Попробуйте ещё раз");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Учёт выручки</h1>
        <p className="mb-6 text-sm text-slate-500">
          {mode === "login" ? "Войдите в свой аккаунт" : "Создайте компанию и первого пользователя"}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "register" && (
            <>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Название компании"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                required
              />
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ваше имя"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </>
          )}
          <input
            type="email"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {mode === "login" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>
        <button
          className="mt-4 text-sm text-slate-500 hover:underline"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Первый раз здесь? Создать компанию" : "Уже есть аккаунт? Войти"}
        </button>
      </div>
    </div>
  );
}
