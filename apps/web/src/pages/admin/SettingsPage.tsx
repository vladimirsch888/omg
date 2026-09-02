import { useEffect, useState } from "react";
import { Database, Monitor, Moon, Sun, Trash2, type LucideIcon } from "lucide-react";
import { api } from "../../api/client";
import { DemoStatus } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { ThemeMode, useTheme } from "../../context/ThemeContext";
import { Button, Card, PageHeader, useUi } from "../../components/ui";

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
  const { user } = useAuth();
  const { mode, resolved, setMode } = useTheme();
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [busy, setBusy] = useState<"seed" | "clear" | null>(null);

  // Demo data rewrites the org's records — owners and admins only. The theme
  // above is a personal preference, so everyone gets that part of the page.
  const canManageDemo = user?.role === "OWNER" || user?.role === "ADMIN";

  function load() {
    if (!canManageDemo) return;
    api.get<DemoStatus>("/demo/status").then((res) => setStatus(res.data));
  }

  useEffect(load, [canManageDemo]);

  async function handleSeed() {
    setBusy("seed");
    try {
      await api.post("/demo/seed");
      ui.toast("Демо-данные добавлены", "success");
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось добавить демо-данные", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleClear() {
    const confirmed = await ui.confirm({
      title: "Удалить демо-данные?",
      message:
        "Демо-клиенты, проекты, продажи, подписки, операции, заявки и часы будут удалены. Реальные данные не затронутся.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    setBusy("clear");
    try {
      await api.post("/demo/clear");
      ui.toast("Демо-данные удалены", "success");
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось удалить демо-данные", "error");
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

      {canManageDemo && (
        <Card title="Демо-данные">
          <p className="text-sm leading-relaxed text-ink-muted">
            Наполняет систему тестовыми клиентами, проектами с подпроектами, продажами, подписками,
            операциями по всем категориям, заявками и часами за последние месяцы — чтобы посмотреть,
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

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" icon={Database} loading={busy === "seed"} disabled={busy !== null} onClick={handleSeed}>
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
          </div>
        </Card>
      )}
    </div>
  );
}
