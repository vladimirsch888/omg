import { formatMoney } from "../../utils/format";

interface Entry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

/**
 * recharts' default tooltip is a white box with a black border — unusable on a
 * dark ground. This one matches the app's raised surfaces.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-overlay px-3 py-2 shadow-xl">
      {label !== undefined && (
        <div className="mb-1.5 text-[11px] font-medium text-ink-subtle">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className="size-2 rounded-full" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span className="font-medium text-ink tnum">{formatMoney(Number(entry.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
