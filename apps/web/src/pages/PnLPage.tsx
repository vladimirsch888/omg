import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { api } from "../api/client";
import { PnLReport } from "../api/types";
import { Card, StatCard } from "../components/Card";
import { formatMoney } from "../utils/format";

export function PnLPage() {
  const [report, setReport] = useState<PnLReport | null>(null);

  useEffect(() => {
    const from = new Date();
    from.setMonth(from.getMonth() - 11);
    from.setDate(1);
    api.get<PnLReport>("/reports/pnl", { params: { from: from.toISOString() } }).then((res) => setReport(res.data));
  }, []);

  if (!report) return <div className="text-slate-500">Загрузка…</div>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">PnL — прибыли и убытки (метод начисления)</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Выручка" value={formatMoney(report.totals.income)} />
        <StatCard label="Расходы" value={formatMoney(report.totals.expense)} />
        <StatCard label="Прибыль" value={formatMoney(report.totals.profit)} />
      </div>

      <Card title="По месяцам">
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <BarChart data={report.periods}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v) => formatMoney(Number(v ?? 0))} />
              <Bar dataKey="income" name="Доход" fill="#16a34a" />
              <Bar dataKey="expense" name="Расход" fill="#dc2626" />
              <Bar dataKey="profit" name="Прибыль" fill="#0f172a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="По категориям">
        <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Категория</th>
              <th className="py-2">Доход</th>
              <th className="py-2">Расход</th>
              <th className="py-2">Итого</th>
            </tr>
          </thead>
          <tbody>
            {report.byCategory.map((c) => (
              <tr key={c.categoryId} className="border-b border-slate-100">
                <td className="py-2">{c.categoryName}</td>
                <td className="py-2 text-green-600">{formatMoney(c.income)}</td>
                <td className="py-2 text-red-600">{formatMoney(c.expense)}</td>
                <td className="py-2 font-medium">{formatMoney(c.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
