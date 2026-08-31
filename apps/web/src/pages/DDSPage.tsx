import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { api } from "../api/client";
import { DDSReport } from "../api/types";
import { Card, StatCard } from "../components/Card";
import { formatMoney } from "../utils/format";

export function DDSPage() {
  const [report, setReport] = useState<DDSReport | null>(null);

  useEffect(() => {
    const from = new Date();
    from.setMonth(from.getMonth() - 11);
    from.setDate(1);
    api.get<DDSReport>("/reports/dds", { params: { from: from.toISOString() } }).then((res) => setReport(res.data));
  }, []);

  if (!report) return <div className="text-slate-500">Загрузка…</div>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">ДДС — движение денежных средств (кассовый метод)</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Приток" value={formatMoney(report.totals.inflow)} />
        <StatCard label="Отток" value={formatMoney(report.totals.outflow)} />
        <StatCard label="Остаток на конец периода" value={formatMoney(report.totals.endingBalance)} />
      </div>

      <Card title="Накопленный остаток">
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <AreaChart data={report.periods}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v) => formatMoney(Number(v ?? 0))} />
              <Area type="monotone" dataKey="cumulativeBalance" name="Остаток" stroke="#0f172a" fill="#0f172a22" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="По месяцам">
        <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Месяц</th>
              <th className="py-2">Приток</th>
              <th className="py-2">Отток</th>
              <th className="py-2">Чистый поток</th>
              <th className="py-2">Остаток</th>
            </tr>
          </thead>
          <tbody>
            {report.periods.map((p) => (
              <tr key={p.period} className="border-b border-slate-100">
                <td className="py-2">{p.period}</td>
                <td className="py-2 text-green-600">{formatMoney(p.inflow)}</td>
                <td className="py-2 text-red-600">{formatMoney(p.outflow)}</td>
                <td className="py-2 font-medium">{formatMoney(p.net)}</td>
                <td className="py-2">{formatMoney(p.cumulativeBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
