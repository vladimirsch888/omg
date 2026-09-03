import { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Drop this column below the given breakpoint (desktop table only). */
  hideBelow?: "md" | "lg" | "xl";
  width?: string;
  /** Keep on one line. Right-aligned (numeric) columns do this anyway. */
  nowrap?: boolean;
}

/**
 * One dataset, two presentations: a table from `sm` up, and a stack of cards
 * on phones. Tables with a horizontal scrollbar are the single worst thing
 * about reading this app on an iPhone, so below `sm` the row is rendered by
 * `renderCard` instead — no sideways scrolling anywhere in the app.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  renderCard,
  empty,
  rowClassName,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowKey: (row: T) => string;
  renderCard: (row: T) => ReactNode;
  empty?: ReactNode;
  /** Extra classes for one row — used to tint rows that need attention. */
  rowClassName?: (row: T) => string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const hideClass = (c: Column<T>) =>
    c.hideBelow === "md"
      ? "hidden md:table-cell"
      : c.hideBelow === "lg"
        ? "hidden lg:table-cell"
        : c.hideBelow === "xl"
          ? "hidden xl:table-cell"
          : "";

  return (
    <>
      {/* Phones: cards */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((row) => (
          <li key={getRowKey(row)}>{renderCard(row)}</li>
        ))}
      </ul>

      {/* sm and up: table. overflow-x-auto is a safety net for narrow laptops —
          columns are tuned so it normally never engages. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={`px-3 pb-2.5 text-xs font-medium text-ink-subtle first:pl-0 last:pr-0 ${
                    c.align === "right" ? "text-right" : "text-left"
                  } ${hideClass(c)}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={getRowKey(row)}
                className={`border-b border-line/60 transition-colors duration-100 last:border-0 hover:bg-raised/50 ${
                  rowClassName?.(row) ?? ""
                }`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-3 align-middle first:pl-0 last:pr-0 ${
                      c.align === "right" ? "text-right" : "text-left"
                    } ${c.nowrap || c.align === "right" ? "whitespace-nowrap" : ""} ${hideClass(c)}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * The phone-side counterpart of a table row: headline on the left, the number
 * that matters on the right, supporting facts underneath, actions at the foot.
 */
export function RowCard({
  title,
  subtitle,
  value,
  valueTone = "neutral",
  meta,
  actions,
  highlight = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  valueTone?: "neutral" | "income" | "expense";
  meta?: ReactNode;
  actions?: ReactNode;
  /** Tints the card to match a highlighted table row. */
  highlight?: boolean;
}) {
  const tone =
    valueTone === "income" ? "text-income" : valueTone === "expense" ? "text-expense" : "text-ink";
  return (
    <div
      className={`rounded-xl border p-3.5 ${
        highlight ? "border-reserve/30 bg-reserve-soft" : "border-line bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">{title}</div>
          {subtitle && <div className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{subtitle}</div>}
        </div>
        {value !== undefined && (
          <div className={`shrink-0 text-base font-semibold tnum ${tone}`}>{value}</div>
        )}
      </div>
      {meta && <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">{meta}</div>}
      {actions && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">{actions}</div>
      )}
    </div>
  );
}

/** Labelled fact inside a RowCard's meta strip. */
export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-ink tnum">{children}</span>
    </span>
  );
}
