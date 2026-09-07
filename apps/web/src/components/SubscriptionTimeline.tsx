import { useEffect, useMemo, useState } from "react";
import { FileCheck2 } from "lucide-react";
import type { Subscription } from "../api/types";
import { formatDate, formatMoney, formatSeats } from "../utils/format";

/** Timeline row: one subscription, its current period and where it ends. */
interface Segment {
  id: string;
  client: string;
  product: string;
  seats: number | null;
  price: number;
  status: Subscription["status"];
  invoiceSent: boolean;
  periodStart: Date;
  end: Date;
  daysLeft: number;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : true));
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Urgency colour: the same scale the badges use — expired, this week, this month, later. */
function barClass(seg: Segment): string {
  if (seg.status === "PAUSED") return "bg-ink-subtle/40 border-ink-subtle/50";
  if (seg.daysLeft < 0) return "bg-expense/70 border-expense";
  if (seg.daysLeft <= 7) return "bg-reserve/70 border-reserve";
  if (seg.daysLeft <= 30) return "bg-accent/60 border-accent";
  return "bg-income/45 border-income/70";
}

function monthTitle(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(d).replace(".", "");
}

const DEFAULT_LIMIT = 20;

/**
 * Gantt-style view of when each client's licence runs out: one bar per
 * subscription from the start of its current period to the expiry date
 * (`expiresAt` when the vendor side is known, otherwise the next billing
 * date), a "today" rule, and colour by how soon the money has to arrive.
 * Pure CSS — no chart library, so it costs nothing on a phone.
 */
export function SubscriptionTimeline({ subscriptions }: { subscriptions: Subscription[] }) {
  const wide = useMediaQuery("(min-width: 640px)");
  const [showAll, setShowAll] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const monthsBefore = 1;
  const monthsAfter = wide ? 6 : 3;
  const windowStart = new Date(today.getFullYear(), today.getMonth() - monthsBefore, 1);
  const windowEnd = new Date(today.getFullYear(), today.getMonth() + monthsAfter + 1, 1);
  const span = windowEnd.getTime() - windowStart.getTime();
  const pos = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - windowStart.getTime()) / span) * 100));

  const segments = useMemo<Segment[]>(() => {
    return subscriptions
      .filter((s) => s.status !== "CANCELLED")
      .map((s) => {
        const end = new Date(s.expiresAt ?? s.nextBillingDate);
        end.setHours(0, 0, 0, 0);
        return {
          id: s.id,
          client: s.client?.name ?? "—",
          product: s.licenseProduct?.name ?? "",
          seats: s.seats ?? null,
          price: Number(s.price),
          status: s.status,
          invoiceSent: Boolean(s.invoiceSentAt),
          periodStart: addMonths(end, -s.durationMonths),
          end,
          daysLeft: Math.round((end.getTime() - today.getTime()) / 86_400_000),
        };
      })
      .sort((a, b) => a.end.getTime() - b.end.getTime() || a.client.localeCompare(b.client, "ru"));
  }, [subscriptions, today]);

  const months: Date[] = [];
  for (let d = new Date(windowStart); d < windowEnd; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);

  if (segments.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-subtle">Нет активных подписок — таймлайн пуст</p>;
  }

  const visible = showAll ? segments : segments.slice(0, DEFAULT_LIMIT);
  const labelWidth = wide ? "11rem" : "6.5rem";

  return (
    <div className="flex flex-col gap-2">
      <div className="relative" style={{ paddingLeft: labelWidth }}>
        {/* Month header */}
        <div className="relative h-5 border-b border-line text-[11px] text-ink-subtle">
          {months.map((m) => (
            <span
              key={m.toISOString()}
              className="absolute top-0 border-l border-line pl-1 capitalize"
              style={{ left: `${pos(m)}%` }}
            >
              {monthTitle(m)}
              {m.getMonth() === 0 || m === months[0] ? ` ${String(m.getFullYear()).slice(2)}` : ""}
            </span>
          ))}
        </div>

        <ul className="relative">
          {/* Month gridlines behind the rows */}
          {months.slice(1).map((m) => (
            <span key={m.toISOString()} className="pointer-events-none absolute inset-y-0 border-l border-line/60" style={{ left: `${pos(m)}%` }} />
          ))}
          {/* Today */}
          <span
            className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-dashed border-ink/70"
            style={{ left: `${pos(today)}%` }}
            aria-hidden
          />

          {visible.map((seg) => {
            const left = pos(seg.periodStart);
            const right = pos(seg.end);
            const width = Math.max(0.6, right - left);
            const endBeyond = seg.end >= windowEnd;
            const title = `${seg.client} — ${seg.product}${seg.seats ? `, ${formatSeats(seg.seats)}` : ""}: до ${formatDate(seg.end.toISOString())} (${
              seg.daysLeft < 0 ? `просрочено ${Math.abs(seg.daysLeft)} дн.` : `${seg.daysLeft} дн.`
            }), ${formatMoney(seg.price)}`;
            return (
              <li key={seg.id} className="relative h-8 border-b border-line/40 last:border-0" title={title}>
                <div
                  className="absolute top-0 flex h-full items-center justify-end gap-1 pr-2 text-xs"
                  style={{ left: `-${labelWidth}`, width: labelWidth }}
                >
                  <span className="min-w-0 truncate text-ink">{seg.client}</span>
                  {seg.invoiceSent && <FileCheck2 className="size-3 shrink-0 text-reserve" strokeWidth={2} />}
                </div>
                <div
                  className={`absolute top-1.5 h-5 rounded-md border ${barClass(seg)} ${endBeyond ? "rounded-r-none border-r-0" : ""}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  {wide && width > 12 && (
                    <span className="absolute inset-y-0 right-1.5 flex items-center text-[10px] font-medium whitespace-nowrap text-ink">
                      {formatDate(seg.end.toISOString()).slice(0, 5)}
                    </span>
                  )}
                </div>
                {/* Expiry marker: visible even when the bar's start is off-window */}
                {!endBeyond && (
                  <span
                    className={`absolute -translate-x-1/2 rounded-full border-2 border-surface ${
                      seg.daysLeft < 0 ? "bg-expense" : seg.daysLeft <= 7 ? "bg-reserve" : seg.daysLeft <= 30 ? "bg-accent" : "bg-income"
                    }`}
                    style={{ left: `${right}%`, width: 10, height: 10, top: 11 }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-subtle">
        <span className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-expense/70" /> истекла
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-reserve/70" /> до 7 дней
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-accent/60" /> до 30 дней
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-income/45" /> позже
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-ink-subtle/40" /> пауза
          </span>
          <span className="inline-flex items-center gap-1">
            <FileCheck2 className="size-3 text-reserve" strokeWidth={2} /> счёт отправлен
          </span>
        </span>
        {segments.length > DEFAULT_LIMIT && (
          <button type="button" className="cursor-pointer text-accent hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Свернуть" : `Показать все ${segments.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
