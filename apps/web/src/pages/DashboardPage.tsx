import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { api } from "../api/client";
import { CashPosition, CompanySummary } from "../api/types";
import { StatCard, Card } from "../components/Card";
import { formatMoney } from "../utils/format";

export function DashboardPage() {
  const [data, setData] = useState<CompanySummary | null>(null);
  const [cash, setCash] = useState<CashPosition | null>(null);

  useEffect(() => {
    api.get<CompanySummary>("/reports/summary").then((res) => setData(res.data));
    api.get<CashPosition>("/reports/cash-position").then((res) => setCash(res.data));
  }, []);

  if (!data) return <div className="text-slate-500">Загрузка…</div>;

  const chartData = data.pnlTrend.map((p) => {
    const dds = data.ddsTrend.find((d) => d.period === p.period);
    return {
      period: p.period,
      Прибыль: p.profit,
      Приток: dds?.inflow ?? 0,
      Отток: dds?.outflow ? -dds.outflow : 0,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Дашборд</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Выручка (текущий месяц)" value={formatMoney(data.currentMonth.income)} />
        <StatCard label="Расходы (текущий месяц)" value={formatMoney(data.currentMonth.expense)} />
        <StatCard label="Прибыль (текущий месяц)" value={formatMoney(data.currentMonth.profit)} />
        <StatCard label="Часы за месяц" value={`${data.hoursThisMonth} ч`} />
      </div>

      {cash && (
        <Card title="Деньги на руках">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <div className="text-sm text-slate-500">Всего на счетах</div>
              <div className="mt-1 text-2xl font-semibold">{formatMoney(cash.cumulativeCash)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Резерв на налог ({cash.taxReservePercent}%)</div>
              <div className="mt-1 text-2xl font-semibold text-amber-600">{formatMoney(cash.taxReserveAccrued)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Свободно к использованию</div>
              <div className="mt-1 text-2xl font-semibold text-green-700">{formatMoney(cash.spendable)}</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            «Всего на счетах» — фактическое движение денег (доходы минус расходы, включая уже выплаченную
            долю вендору). «Резерв на налог» — то, что накопительно отложено с облагаемых поступлений
            и пока не потрачено. «Свободно» — то, чем можно распоряжаться прямо сейчас.
          </p>
        </Card>
      )}

      <Card title="Прибыль и денежный поток за 12 месяцев">
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v) => formatMoney(Number(v ?? 0))} />
              <Line type="monotone" dataKey="Прибыль" stroke="#0f172a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Приток" stroke="#16a34a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Отток" stroke="#dc2626" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Топ клиентов по LTV">
        <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Клиент</th>
              <th className="py-2">Выручка</th>
              <th className="py-2">Чистая прибыль (LTV)</th>
              <th className="py-2">Ср. в месяц</th>
            </tr>
          </thead>
          <tbody>
            {data.topClients.map((c) => (
              <tr key={c.clientId} className="border-b border-slate-100">
                <td className="py-2">{c.clientName}</td>
                <td className="py-2">{formatMoney(c.totalIncome)}</td>
                <td className="py-2 font-medium">{formatMoney(c.ltv)}</td>
                <td className="py-2">{formatMoney(c.avgMonthlyRevenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
