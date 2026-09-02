/**
 * Deliberately hand-drawn SVG rather than a recharts component: sparklines sit
 * inside KPI cards on the very first screen, and pulling the whole charting
 * library in for a 40px line would undo the lazy-loading everywhere else.
 */
export function Sparkline({
  data,
  tone = "accent",
  className = "",
}: {
  data: number[];
  tone?: "accent" | "income" | "expense";
  className?: string;
}) {
  if (data.length < 2) return null;

  const stroke =
    tone === "income" ? "var(--color-income)" : tone === "expense" ? "var(--color-expense)" : "var(--color-accent)";

  const width = 100;
  const height = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((value, i) => {
    const x = i * stepX;
    // Inset by 3px top and bottom so the stroke isn't clipped at the extremes.
    const y = height - 3 - ((value - min) / span) * (height - 6);
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const gradientId = `spark-${tone}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`h-full w-full ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Signed change vs. the previous period, shown under a KPI value. */
export function Delta({ value, suffix = "к прошлому месяцу" }: { value: number; suffix?: string }) {
  if (!Number.isFinite(value)) return null;
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-income" : "text-expense"}`}>
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d={positive ? "M6 10V2m0 0L2.5 5.5M6 2l3.5 3.5" : "M6 2v8m0 0 3.5-3.5M6 10 2.5 6.5"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {positive ? "+" : "−"}
      {Math.abs(Math.round(value))}%
      <span className="font-normal text-ink-subtle">{suffix}</span>
    </span>
  );
}
