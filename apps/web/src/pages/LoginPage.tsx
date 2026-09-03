import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Button, Field, Input } from "../components/ui";

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sign-up is only offered while the server allows it (first setup or
  // ALLOW_REGISTRATION) — otherwise the link would lead to a 403.
  useEffect(() => {
    api
      .get<{ open: boolean }>("/auth/registration-status")
      .then((res) => setRegistrationOpen(res.data.open))
      .catch(() => setRegistrationOpen(false));
  }, []);

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
    } catch (err) {
      setError(errorMessage(err, "Ошибка. Попробуйте ещё раз"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* Soft accent wash so the sign-in screen doesn't read as a flat dark box. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 60% at 50% -10%, rgba(63,166,151,0.14) 0%, rgba(63,166,151,0) 60%)",
        }}
      />

      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-2xl sm:p-8">
        <h1 className="text-lg font-semibold tracking-tight">
          {mode === "login" ? "Вход в систему" : "Создание компании"}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          {mode === "login"
            ? "Учёт выручки, подписок и денег на руках."
            : "Заведите компанию и первого пользователя — владельца."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3.5">
          {mode === "register" && (
            <>
              <Field label="Название компании">
                <Input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required />
              </Field>
              <Field label="Ваше имя">
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
            </>
          )}

          <Field label="Email">
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>

          <Field label="Пароль" hint={mode === "register" ? "Не короче 8 символов, не только цифры" : undefined}>
            <Input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 8 : 1}
            />
          </Field>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-expense/25 bg-expense-soft px-3 py-2.5 text-sm text-expense">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" loading={submitting} className="mt-1 w-full">
            {mode === "login" ? "Войти" : "Зарегистрироваться"}
          </Button>
        </form>

        {registrationOpen ? (
          <button
            className="mt-5 w-full text-center text-sm text-ink-muted transition-colors hover:text-accent"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Первый раз здесь? Создать компанию" : "Уже есть аккаунт? Войти"}
          </button>
        ) : (
          <p className="mt-5 text-center text-xs text-ink-subtle">
            Нет доступа? Попросите владельца или администратора создать вам пользователя.
          </p>
        )}
      </div>
    </div>
  );
}
