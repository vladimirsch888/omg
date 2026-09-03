/**
 * Date helpers shared by billing, forecasts and reports.
 *
 * All of these work in the server's local time zone (set TZ on the service —
 * the bootstrap script sets Europe/Moscow), so "this month" flips when the
 * business's day does, not at UTC midnight.
 */

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Adds N months without the day drifting. `new Date().setMonth()` overflows
 * short months (31 Jan + 1 → 3 Mar), and a subscription started on the 31st
 * would have its billing day slide forward forever. Here the day is clamped
 * to the target month's length, and `anchorDay` (the subscription's original
 * billing day) is restored whenever the target month is long enough — so
 * 31 Jan → 28 Feb → 31 Mar, not 28 Mar.
 */
export function addMonthsClamped(date: Date, months: number, anchorDay?: number): Date {
  const day = anchorDay ?? date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  return target;
}

/** 23:59:59.999 of the given date, for inclusive "to" filters. */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

/**
 * Parses a query-string date. Accepts an ISO timestamp or a plain
 * YYYY-MM-DD; returns null for anything unparseable so the caller can answer
 * 400 instead of letting an Invalid Date reach the database.
 */
export function parseDateParam(value: string | undefined): Date | null | undefined {
  if (value === undefined || value === "") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
