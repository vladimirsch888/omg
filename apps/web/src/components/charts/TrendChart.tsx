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
import { axisProps, chartColors, compactMoney, gridProps, shortPeriod } from "./theme";
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
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.accent} stopOpacity={0.32} />
              <stop offset="100%" stopColor={chartColors.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="period" tickFormatter={shortPeriod} {...axisProps} />
          <YAxis tickFormatter={compactMoney} width={72} {...axisProps} />
          <Tooltip
            content={<ChartTooltip labelFormatter={(l) => String(l)} />}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          <Legend
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ fontSize: 11, color: chartColors.muted, paddingTop: 8 }}
          />
          <Bar dataKey="Приток" fill={chartColors.income} fillOpacity={0.28} radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="Отток" fill={chartColors.expense} fillOpacity={0.28} radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Area
            type="monotone"
            dataKey="Прибыль"
            stroke={chartColors.accent}
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
