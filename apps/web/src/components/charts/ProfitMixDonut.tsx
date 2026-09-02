import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "../../utils/format";
import { useChartColors } from "./theme";
import { ChartTooltip } from "./ChartTooltip";

export interface ProfitMixSlice {
  name: string;
  value: number;
  /** "license" | "work" | "other" — decides the colour. */
  kind: "license" | "work" | "other";
}

/**
 * Where the year's net profit came from. Percentages are the headline here —
 * the question this answers is "какая доля прибыли с лицензий, а какая с
 * работ", so the share is set in the large type and the rouble amount reads
 * as the supporting detail.
 */
export default function ProfitMixDonut({ data, total }: { data: ProfitMixSlice[]; total: number }) {
  const colors = useChartColors();

  // Not accent + income for the two main slices: those two are nearly the same
  // hue in both themes, which makes a two-slice donut look like one solid ring.
  const colorFor: Record<ProfitMixSlice["kind"], string> = {
    license: colors.accent,
    work: colors.palette[2],
    other: colors.muted,
  };

  const slices = data.filter((s) => s.value > 0);
  if (slices.length === 0 || total <= 0) {
    return <p className="py-8 text-center text-sm text-ink-subtle">За год ещё нет прибыли для разбивки</p>;
  }

  const share = (value: number) => (value / total) * 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto h-40 w-40 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none">
              {slices.map((s) => (
                <Cell key={s.kind} fill={colorFor[s.kind]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-ink-subtle">Чистая прибыль</span>
          <span className="text-sm font-semibold text-ink tnum">{formatMoney(total)}</span>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {slices.map((s) => (
          <li key={s.kind} className="flex items-center gap-3">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colorFor[s.kind] }} />
            <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">{s.name}</span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold text-ink tnum">{share(s.value).toFixed(1)}%</span>
              <span className="block text-[11px] text-ink-subtle tnum">{formatMoney(s.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
