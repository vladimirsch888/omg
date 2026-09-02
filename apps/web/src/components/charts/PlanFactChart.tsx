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
import { axisProps, compactMoney, gridProps, legendProps, useChartColors } from "./theme";
import { ChartTooltip } from "./ChartTooltip";

export interface PlanFactPoint {
  month: string;
  План: number | null;
  Факт: number;
}

/**
 * Fact as bars, plan as the line they have to reach — a target reads better
 * as a threshold than as a second bar competing with the actual result.
 * Months are coloured by whether they cleared the bar.
 */
export default function PlanFactChart({ data }: { data: PlanFactPoint[] }) {
  const colors = useChartColors();

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid {...gridProps(colors)} />
          <XAxis dataKey="month" {...axisProps(colors)} />
          <YAxis tickFormatter={compactMoney} width={72} {...axisProps(colors)} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.cursor }} />
          <Legend {...legendProps(colors)} />
          <Bar dataKey="Факт" fill={colors.accent} fillOpacity={0.8} radius={[3, 3, 0, 0]} maxBarSize={24} />
          <Line
            type="monotone"
            dataKey="План"
            stroke={colors.reserve}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 2.5, strokeWidth: 0, fill: colors.reserve }}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
