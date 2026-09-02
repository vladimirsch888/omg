import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisProps, chartColors, compactMoney, gridProps, shortPeriod } from "./theme";
import { ChartTooltip } from "./ChartTooltip";

export interface PnlPoint {
  period: string;
  income: number;
  expense: number;
  profit: number;
}

/** Income vs expense as paired bars, profit as the line that ties them together. */
export default function PnlBars({ data }: { data: PnlPoint[] }) {
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="period" tickFormatter={shortPeriod} {...axisProps} />
          <YAxis tickFormatter={compactMoney} width={72} {...axisProps} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: chartColors.muted, paddingTop: 8 }} />
          <Bar dataKey="income" name="Доход" fill={chartColors.income} fillOpacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={20} />
          <Bar dataKey="expense" name="Расход" fill={chartColors.expense} fillOpacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={20} />
          <Line
            type="monotone"
            dataKey="profit"
            name="Прибыль"
            stroke={chartColors.ink}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
