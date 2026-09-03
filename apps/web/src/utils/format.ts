export function formatMoney(value: number | string, currency = "RUB"): string {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(value)
  );
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** «13 ч», «1,5 ч» — hours as the business writes them. */
export function formatHours(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} ч`;
}

/**
 * A Date as the YYYY-MM-DD an <input type="date"> wants, in LOCAL time.
 * `toISOString().slice(0, 10)` gives the UTC date, which between midnight
 * and 03:00 Moscow time is still yesterday.
 */
export function toLocalDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's date for a form default — computed when called, never at module load. */
export function todayInput(): string {
  return toLocalDateInput(new Date());
}

/** A stored timestamp back into the date input, in local time. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return toLocalDateInput(new Date(value));
}

/** The date input's value as an ISO timestamp at local midnight. */
export function dateInputToIso(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

/**
 * Adds N working days (skipping Saturday/Sunday) to a date, e.g. for
 * estimating a project deadline from its start date and duration in
 * working days. Does not account for public holidays.
 */
export function addWorkingDays(start: Date, days: number): Date {
  const result = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) remaining--;
  }
  return result;
}

/** First day of the month N months ago, as a date-input value. */
export function monthsAgoInput(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  return toLocalDateInput(d);
}

/** Triggers a browser download of an authenticated file (CSV export). */
export async function downloadFile(url: string, fallbackName: string) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let message = "Не удалось выгрузить файл";
    try {
      message = (await res.json()).error ?? message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
