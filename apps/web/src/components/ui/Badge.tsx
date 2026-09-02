import { ReactNode } from "react";

export type BadgeTone = "neutral" | "income" | "expense" | "reserve" | "accent";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-raised text-ink-muted border-line",
  income: "bg-income-soft text-income border-income/25",
  expense: "bg-expense-soft text-expense border-expense/25",
  reserve: "bg-reserve-soft text-reserve border-reserve/25",
  accent: "bg-accent-soft text-accent border-accent/25",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Status pill with a leading dot — reads faster than a coloured background alone. */
export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const dot: Record<BadgeTone, string> = {
    neutral: "bg-ink-subtle",
    income: "bg-income",
    expense: "bg-expense",
    reserve: "bg-reserve",
    accent: "bg-accent",
  };
  return (
    <Badge tone={tone}>
      <span className={`size-1.5 rounded-full ${dot[tone]}`} />
      {label}
    </Badge>
  );
}
