/**
 * CSV the way Excel on a Russian Windows opens it without a wizard: UTF-8
 * with BOM, semicolon separator, CRLF line ends, decimal comma. Google
 * Sheets and Numbers read the same file fine.
 */
export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined | Date)[][]): string {
  const escape = (value: string | number | boolean | null | undefined | Date): string => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return formatDate(value);
    if (typeof value === "number") return String(value).replace(".", ",");
    if (typeof value === "boolean") return value ? "да" : "нет";
    const text = String(value);
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(";"), ...rows.map((r) => r.map(escape).join(";"))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}
