import { FormEvent, useEffect, useState } from "react";
import { Database, KeyRound, LogOut, Monitor, Moon, Send, Sun, Trash2, type LucideIcon } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { DemoStatus } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { ThemeMode, useTheme } from "../../context/ThemeContext";
import { Button, Card, Field, Input, PageHeader, useUi } from "../../components/ui";

const counters: { key: keyof DemoStatus; label: string }[] = [
  { key: "clients", label: "клиентов" },
  { key: "projects", label: "проектов" },
  { key: "sales", label: "продаж" },
  { key: "subscriptions", label: "подписок" },
  { key: "operations", label: "операций" },
  { key: "requests", label: "заявок" },
  { key: "timeEntries", label: "записей часов" },
  { key: "licenseProducts", label: "продуктов" },
  { key: "salesPlans", label: "планов продаж" },
];

const themeOptions: { mode: ThemeMode; label: string; icon: LucideIcon; hint: string }[] = [
  { mode: "system", label: "Как в системе", icon: Monitor, hint: "следует настройке телефона или ноутбука" },
  { mode: "light", label: "Светлая", icon: Sun, hint: "тёплый белый фон" },
  { mode: "dark", label: "Тёмная", icon: Moon, hint: "тёплый графит" },
];

export function SettingsPage() {
  const ui = useUi();
  const { user, isAdmin, replaceToken, logout } = useAuth();
  const { mode, resolved, setMode } = useTheme();
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [busy, setBusy] = useState<"seed" | "clear" | "telegram" | "password" | "logout" | null>(null);
  const [telegramConfigured, setTelegramConfigured] = useState<boolean | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordRepeat, setNewPasswordRepeat] = useState("");

  function load() {
    if (!isAdmin) return;
    api.get<DemoStatus>("/demo/status").then((res) => setStatus(res.data));
  }

  useEffect(load, [isAdmin]);

  useEffect(() => {
    api
      .get<{ telegramConfigured: boolean }>("/reminders")
      .then((res) => setTelegramConfigured(res.data.telegramConfigured))
      .catch(() => setTelegramConfigured(false));
  }, []);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== newPasswordRepeat) {
      ui.toast("Новый пароль и повтор не совпадают", "error");
      return;
    }
    setBusy("password");
    try {
      const res = await api.post<{ token: string }>("/auth/change-password", { currentPassword, newPassword });
      replaceToken(res.data.token);
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordRepeat("");
      ui.toast("Пароль изменён. Другие устройства разлогинены", "success");
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось сменить пароль"), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleLogoutAll() {
    const confirmed = await ui.confirm({
      title: "Выйти на всех устройствах?",
      message: "Все ваши сессии, включая эту, будут завершены. Нужно будет войти заново.",
      confirmLabel: "Выйти везде",
      danger: true,
    });
    if (!confirmed) return;
    setBusy("logout");
    try {
      await api.post("/auth/logout-all");
      logout();
      window.location.href = "/login";
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось завершить сессии"), "error");
      setBusy(null);
    }
  }

  async function handleSeed() {
    setBusy("seed");
    try {
      await api.post("/demo/seed");
      ui.toast("Демо-данные добавлены", "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось добавить демо-данные"), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleClear() {
    const confirmed = await ui.confirm({
      title: "Удалить демо-данные?",
      message:
        "Демо-клиенты, проекты, продажи, подписки, операции, заявки, часы и планы продаж будут удалены. Реальные данные не затронутся.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    setBusy("clear");
    try {
      await api.post("/demo/clear");
      ui.toast("Демо-данные удалены", "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось удалить демо-данные"), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleTelegramTest() {
    setBusy("telegram");
    try {
      const res = await api.post<{ count: number }>("/reminders/telegram/send");
      ui.toast(`Дайджест отправлен в Telegram (${res.data.count} напоминаний)`, "success");
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось отправить в Telegram"), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader title="Настройки" />

      <Card title="Оформление">
        <p className="text-sm leading-relaxed text-ink-muted">
          Выбор сохраняется в этом браузере и применяется сразу. Сейчас включена{" "}
          <span className="font-medium text-ink">{resolved === "light" ? "светлая" : "тёмная"}</span> тема.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {themeOptions.map(({ mode: option, label, icon: Icon, hint }) => {
            const active = mode === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                aria-pressed={active}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  active
                    ? "border-accent/40 bg-accent-soft"
                    : "border-line bg-raised/40 hover:border-line-strong hover:bg-raised"
                }`}
              >
                <span
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    active ? "bg-accent text-accent-ink" : "bg-raised text-ink-muted"
                  }`}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${active ? "text-accent" : "text-ink"}`}>{label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-subtle">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Безопасность">
        <p className="text-sm leading-relaxed text-ink-muted">
          Вы вошли как <span className="font-medium text-ink">{user?.email}</span>. После смены пароля все остальные устройства
          будут разлогинены, а это — останется в системе.
        </p>
        <form onSubmit={handleChangePassword} className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <Field label="Текущий пароль">
            <Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </Field>
          <Field label="Новый пароль" hint="Не короче 8 символов, не только цифры">
            <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </Field>
          <Field label="Повторите новый пароль">
            <Input type="password" autoComplete="new-password" value={newPasswordRepeat} onChange={(e) => setNewPasswordRepeat(e.target.value)} required minLength={8} />
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button type="submit" variant="primary" icon={KeyRound} loading={busy === "password"} disabled={busy !== null}>
              Сменить пароль
            </Button>
            <Button type="button" variant="secondary" icon={LogOut} loading={busy === "logout"} disabled={busy !== null} onClick={handleLogoutAll}>
              Выйти на всех устройствах
            </Button>
          </div>
        </form>
      </Card>

      {isAdmin && (
        <Card title="Напоминания в Telegram">
          <p className="text-sm leading-relaxed text-ink-muted">
            Раз в день бот присылает в чат сводку: просроченные и ближайшие продления, неоплаченные счета, сроки работ и срочные заявки —
            то же, что показано на дашборде в блоке «Требует внимания».
            {telegramConfigured === false && (
              <>
                {" "}Чтобы включить, задайте на сервере <code className="rounded bg-raised px-1 py-0.5 text-[12px]">TELEGRAM_BOT_TOKEN</code> и{" "}
                <code className="rounded bg-raised px-1 py-0.5 text-[12px]">TELEGRAM_CHAT_ID</code> в файле .env и перезапустите API.
              </>
            )}
          </p>
          <div className="mt-4">
            <Button variant="secondary" icon={Send} loading={busy === "telegram"} disabled={busy !== null || telegramConfigured !== true} onClick={handleTelegramTest}>
              Отправить дайджест сейчас
            </Button>
            {telegramConfigured === false && <span className="ml-3 text-xs text-ink-subtle">Telegram не настроен</span>}
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card title="Демо-данные">
          <p className="text-sm leading-relaxed text-ink-muted">
            Наполняет систему тестовыми клиентами, проектами с подпроектами, продажами, подписками,
            операциями по всем категориям, заявками, часами и планами продаж — чтобы посмотреть,
            как выглядят отчёты и дашборд с реальными цифрами. Такие записи помечены отдельным флагом
            и не смешиваются с настоящими данными.
          </p>

          {status && (
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {counters.map(({ key, label }) => (
                <div key={key} className="rounded-xl border border-line bg-raised/50 p-3 text-center">
                  <div className="text-lg font-semibold text-ink tnum">{status[key] as number}</div>
                  <div className="mt-0.5 text-[11px] text-ink-subtle">{label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              icon={Database}
              loading={busy === "seed"}
              disabled={busy !== null || Boolean(status?.hasDemoData)}
              onClick={handleSeed}
            >
              Наполнить демо-данными
            </Button>
            <Button
              variant="secondary"
              icon={Trash2}
              loading={busy === "clear"}
              disabled={busy !== null || !status?.hasDemoData}
              onClick={handleClear}
              className="text-expense"
            >
              Удалить демо-данные
            </Button>
            {status?.hasDemoData && <span className="text-xs text-ink-subtle">Демо-данные уже добавлены — сначала удалите, чтобы наполнить заново.</span>}
          </div>
        </Card>
      )}
    </div>
  );
}
