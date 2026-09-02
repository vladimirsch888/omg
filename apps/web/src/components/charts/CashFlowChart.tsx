import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisProps, compactMoney, gridProps, legendProps, shortPeriod, useChartColors } from "./theme";
import { ChartTooltip } from "./ChartTooltip";

export interface CashFlowPoint {
  period: string;
  inflow: number;
  outflow: number;
  cumulativeBalance: number;
}

/**
 * Money in and out per month as bars, with the running balance as an area —
 * the balance is what the question "хватит ли денег" actually asks about.
 */
export default function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const colors = useChartColors();

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.accent} stopOpacity={0.3} />
              <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps(colors)} />
          <XAxis dataKey="period" tickFormatter={shortPeriod} {...axisProps(colors)} />
          <YAxis tickFormatter={compactMoney} width={72} {...axisProps(colors)} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.cursor }} />
          <Legend {...legendProps(colors)} />
          <Bar dataKey="inflow" name="Приток" fill={colors.income} fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={20} />
          <Bar dataKey="outflow" name="Отток" fill={colors.expense} fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={20} />
          <Area
            type="monotone"
            dataKey="cumulativeBalance"
            name="Остаток"
            stroke={colors.accent}
            strokeWidth={2}
            fill="url(#balanceFill)"
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
