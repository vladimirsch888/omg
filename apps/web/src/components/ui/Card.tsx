import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Card({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface card-shadow ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          {typeof title === "string" ? (
            <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
          ) : (
            title
          )}
          {action}
        </header>
      )}
      <div className={`p-4 sm:p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/**
 * Wrapper for a list/table block. On phones the rows are already cards, so a
 * surrounding card would frame cards inside a card — here it collapses to a
 * plain container and only becomes a real panel from `sm` up.
 */
export function ListCard({ children, title }: { children: ReactNode; title?: ReactNode }) {
  return (
    <section className="rounded-none border-0 bg-transparent sm:rounded-xl sm:border sm:border-line sm:bg-surface sm:card-shadow">
      {title && (
        <header className="mb-2 px-0 sm:mb-0 sm:border-b sm:border-line sm:px-5 sm:py-3">
          <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        </header>
      )}
      <div className="p-0 sm:p-5">{children}</div>
    </section>
  );
}

type Tone = "neutral" | "income" | "expense" | "reserve" | "accent";

const toneText: Record<Tone, string> = {
  neutral: "text-ink",
  income: "text-income",
  expense: "text-expense",
  reserve: "text-reserve",
  accent: "text-accent",
};

const toneIconBg: Record<Tone, string> = {
  neutral: "bg-raised text-ink-muted",
  income: "bg-income-soft text-income",
  expense: "bg-expense-soft text-expense",
  reserve: "bg-reserve-soft text-reserve",
  accent: "bg-accent-soft text-accent",
};

/**
 * A single headline number. `chart` takes an optional sparkline rendered
 * under the value, `hint` the one-line explanation of what the number means.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
  chart,
  delta,
  wide = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  icon?: LucideIcon;
  chart?: ReactNode;
  delta?: ReactNode;
  /** Span both columns of the phone's two-up KPI grid (for cards with a chart). */
  wide?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border border-line bg-surface p-3.5 card-shadow sm:p-5 ${
        wide ? "col-span-2 sm:col-span-1" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] leading-snug font-medium text-ink-muted sm:text-xs">{label}</span>
        {Icon && (
          <span
            className={`hidden size-8 shrink-0 items-center justify-center rounded-lg sm:flex ${toneIconBg[tone]}`}
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </span>
        )}
      </div>
      <div className={`mt-1.5 text-xl font-semibold tracking-tight tnum sm:mt-2 sm:text-2xl ${toneText[tone]}`}>
        {value}
      </div>
      {delta && <div className="mt-1">{delta}</div>}
      {chart && <div className="-mx-1 mt-2.5 h-9 sm:mt-3 sm:h-10">{chart}</div>}
      {/* Hints are guidance, not data — they'd double the card's height on a phone. */}
      {hint && <p className="mt-2 hidden text-[11px] leading-relaxed text-ink-subtle sm:block">{hint}</p>}
    </div>
  );
}

/** Page title + optional description and right-hand actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {/* Below lg the sticky top bar already names the page — no need twice. */}
        <h1 className="hidden text-xl font-semibold tracking-tight lg:block lg:text-2xl">{title}</h1>
        {description && (
          <p className="line-clamp-3 max-w-3xl text-xs leading-relaxed text-ink-muted sm:line-clamp-none sm:text-sm lg:mt-1.5">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
