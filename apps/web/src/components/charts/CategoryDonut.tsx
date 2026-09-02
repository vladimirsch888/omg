import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "../../utils/format";
import { categoryPalette } from "./theme";
import { ChartTooltip } from "./ChartTooltip";

export interface CategorySlice {
  name: string;
  value: number;
}

/**
 * Expense structure. The donut hole carries the total, so the chart answers
 * both "сколько всего" and "на что" without a separate stat card.
 */
export default function CategoryDonut({ data, total }: { data: CategorySlice[]; total: number }) {
  if (data.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="66%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={categoryPalette[i % categoryPalette.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-ink-subtle">Всего</span>
          <span className="text-sm font-semibold text-ink tnum">{formatMoney(total)}</span>
        </div>
      </div>

      <ul className="flex w-full min-w-0 flex-col gap-2">
        {data.map((slice, i) => (
          <li key={slice.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: categoryPalette[i % categoryPalette.length] }}
              />
              <span className="truncate text-ink-muted">{slice.name}</span>
            </span>
            <span className="shrink-0 text-ink tnum">{formatMoney(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
