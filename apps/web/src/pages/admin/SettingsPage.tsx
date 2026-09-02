import { useEffect, useState } from "react";
import { Database, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import { DemoStatus } from "../../api/types";
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
];

export function SettingsPage() {
  const ui = useUi();
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [busy, setBusy] = useState<"seed" | "clear" | null>(null);

  function load() {
    api.get<DemoStatus>("/demo/status").then((res) => setStatus(res.data));
  }

  useEffect(load, []);

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
      message: "Демо-клиенты, проекты, продажи, подписки, операции, заявки и часы будут удалены. Реальные данные не затронутся.",
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
    </div>
  );
}
