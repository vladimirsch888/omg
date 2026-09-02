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

export interface TrendPoint {
  period: string;
  Прибыль: number;
  Приток: number;
  Отток: number;
}

/**
 * Profit as a filled area (the line you actually watch) with cash in/out as
 * low-contrast bars behind it, instead of three competing lines.
 */
export default function TrendChart({ data }: { data: TrendPoint[] }) {
  const colors = useChartColors();

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.accent} stopOpacity={0.32} />
              <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps(colors)} />
          <XAxis dataKey="period" tickFormatter={shortPeriod} {...axisProps(colors)} />
          <YAxis tickFormatter={compactMoney} width={72} {...axisProps(colors)} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.cursor }} />
          <Legend {...legendProps(colors)} />
          <Bar dataKey="Приток" fill={colors.income} fillOpacity={0.28} radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="Отток" fill={colors.expense} fillOpacity={0.28} radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Area
            type="monotone"
            dataKey="Прибыль"
            stroke={colors.accent}
            strokeWidth={2}
            fill="url(#profitFill)"
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
