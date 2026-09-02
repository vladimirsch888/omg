import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-raised ${className}`} />;
}

/** Placeholder shown while a page's first payload is in flight. */
export function PageSkeleton({ stats = 4, rows = 5 }: { stats?: number; rows?: number }) {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-56" />
      {stats > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}
      <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-raised text-ink-subtle">
        <Icon className="size-5" strokeWidth={1.6} />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Horizontal proportion bar — used inside table rows (category share, budget
 * usage) where a full chart would be overkill but a bare number is hard to
 * compare at a glance.
 */
export function InlineBar({
  value,
  max,
  tone = "accent",
}: {
  value: number;
  max: number;
  tone?: "accent" | "income" | "expense";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((Math.abs(value) / max) * 100)) : 0;
  const fill = tone === "income" ? "bg-income" : tone === "expense" ? "bg-expense" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
