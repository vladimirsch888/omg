/**
 * Shared look for every recharts chart: thin strokes, horizontal-only grid at
 * low opacity, no axis lines, and abbreviated money on the value axis. Lives in
 * the charts folder so it only ever loads inside a lazily-imported chunk.
 */

export const chartColors = {
  accent: "#3fa697",
  income: "#56b894",
  expense: "#d08268",
  reserve: "#d6a85f",
  ink: "#f2efe9",
  muted: "#a8a29a",
  grid: "#34312d",
};

/** Category palette for donuts — muted, no two adjacent hues clashing. */
export const categoryPalette = [
  "#3fa697",
  "#d6a85f",
  "#8f9ecb",
  "#d08268",
  "#7fae86",
  "#c08bab",
  "#9d8f7a",
  "#6fa2b8",
];

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: chartColors.muted, fontSize: 11 },
} as const;

export const gridProps = {
  strokeDasharray: "2 6",
  stroke: chartColors.grid,
  vertical: false,
} as const;

/**
 * 1 234 567 → «1,2 млн»; keeps value axes narrow enough for a phone. The
 * separator is a non-breaking space so a tick never wraps onto two lines and
 * gets clipped at the top of the plot.
 */
export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(".", ",")} млн`;
  }
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} тыс`;
  return `${sign}${abs}`;
}

/** Period keys arrive as "2026-09"; axes only need the month. */
export function shortPeriod(period: string): string {
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const [, month] = period.split("-");
  const index = Number(month) - 1;
  return months[index] ?? period;
}
