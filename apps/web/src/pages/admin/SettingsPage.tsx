import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { DemoStatus } from "../../api/types";
import { Card } from "../../components/Card";

export function SettingsPage() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [busy, setBusy] = useState<"seed" | "clear" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    api.get<DemoStatus>("/demo/status").then((res) => setStatus(res.data));
  }

  useEffect(load, []);

  async function handleSeed() {
    setBusy("seed");
    setMessage(null);
    try {
      await api.post("/demo/seed");
      setMessage("Демо-данные добавлены.");
      load();
    } finally {
      setBusy(null);
    }
  }

  async function handleClear() {
    if (!confirm("Удалить все демо-данные (демо-клиенты, проекты, операции, заявки, часы)? Реальные данные не затронутся.")) {
      return;
    }
    setBusy("clear");
    setMessage(null);
    try {
      await api.post("/demo/clear");
      setMessage("Демо-данные удалены.");
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Настройки</h1>

      <Card title="Демо-данные">
        <p className="mb-4 text-sm text-slate-500">
          Наполняет систему тестовыми клиентами, проектами (включая подпроекты), операциями по всем
          категориям (лицензии amoCRM/Wazzup/NOVA, работы, сопровождение, зарплата и т.д.), заявками и
          учётом часов за последние месяцы — удобно, чтобы посмотреть, как выглядят отчёты и дашборд
          с реальными цифрами. Помечаются отдельным флагом и не смешиваются с вашими настоящими данными.
        </p>

        {status && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-md bg-slate-50 p-2 text-center">
              <div className="text-lg font-semibold">{status.clients}</div>
              <div className="text-xs text-slate-500">клиентов</div>
            </div>
            <div className="rounded-md bg-slate-50 p-2 text-center">
              <div className="text-lg font-semibold">{status.projects}</div>
              <div className="text-xs text-slate-500">проектов</div>
            </div>
            <div className="rounded-md bg-slate-50 p-2 text-center">
              <div className="text-lg font-semibold">{status.operations}</div>
              <div className="text-xs text-slate-500">операций</div>
            </div>
            <div className="rounded-md bg-slate-50 p-2 text-center">
              <div className="text-lg font-semibold">{status.requests}</div>
              <div className="text-xs text-slate-500">заявок</div>
            </div>
            <div className="rounded-md bg-slate-50 p-2 text-center">
              <div className="text-lg font-semibold">{status.timeEntries}</div>
              <div className="text-xs text-slate-500">записей часов</div>
            </div>
          </div>
        )}

        {message && <div className="mb-3 text-sm text-green-700">{message}</div>}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSeed}
            disabled={busy !== null}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === "seed" ? "Наполняю…" : "Наполнить демо-данными"}
          </button>
          <button
            onClick={handleClear}
            disabled={busy !== null || !status?.hasDemoData}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {busy === "clear" ? "Удаляю…" : "Удалить демо-данные"}
          </button>
        </div>
      </Card>
    </div>
  );
}
