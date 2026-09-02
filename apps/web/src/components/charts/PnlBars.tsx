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
import { axisProps, compactMoney, gridProps, legendProps, shortPeriod, useChartColors } from "./theme";
import { ChartTooltip } from "./ChartTooltip";

export interface PnlPoint {
  period: string;
  income: number;
  expense: number;
  profit: number;
}

/** Income vs expense as paired bars, profit as the line that ties them together. */
export default function PnlBars({ data }: { data: PnlPoint[] }) {
  const colors = useChartColors();

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid {...gridProps(colors)} />
          <XAxis dataKey="period" tickFormatter={shortPeriod} {...axisProps(colors)} />
          <YAxis tickFormatter={compactMoney} width={72} {...axisProps(colors)} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.cursor }} />
          <Legend {...legendProps(colors)} />
          <Bar dataKey="income" name="Доход" fill={colors.income} fillOpacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={20} />
          <Bar dataKey="expense" name="Расход" fill={colors.expense} fillOpacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={20} />
          <Line
            type="monotone"
            dataKey="profit"
            name="Прибыль"
            stroke={colors.ink}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
