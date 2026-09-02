import { useTheme } from "../../context/ThemeContext";

/**
 * Recharts takes colours as plain strings, so unlike the rest of the app it
 * can't just reference `--color-accent`. Both palettes live here and the hook
 * below picks one — which also re-renders every chart when the theme changes.
 */
export interface ChartColors {
  accent: string;
  income: string;
  expense: string;
  reserve: string;
  ink: string;
  muted: string;
  grid: string;
  /** Fill of the hover band behind the tooltip. */
  cursor: string;
  /** Donut slices — muted, no two adjacent hues clashing. */
  palette: string[];
}

const dark: ChartColors = {
  accent: "#3fa697",
  income: "#56b894",
  expense: "#d08268",
  reserve: "#d6a85f",
  ink: "#f2efe9",
  muted: "#a8a29a",
  grid: "#34312d",
  cursor: "rgba(255,255,255,0.03)",
  palette: ["#3fa697", "#d6a85f", "#8f9ecb", "#d08268", "#7fae86", "#c08bab", "#9d8f7a", "#6fa2b8"],
};

const light: ChartColors = {
  accent: "#0f6e63",
  income: "#0e7c66",
  expense: "#b4553f",
  reserve: "#a3762b",
  ink: "#1f1d1a",
  muted: "#6b655c",
  grid: "#e0dbd2",
  cursor: "rgba(31,29,26,0.04)",
  palette: ["#0f6e63", "#b98a2e", "#5d6b9c", "#b4553f", "#4f8560", "#96617e", "#7d7264", "#3f7d97"],
};

export function useChartColors(): ChartColors {
  const { resolved } = useTheme();
  return resolved === "light" ? light : dark;
}

/** Axis/grid props derived from the active palette. */
export function axisProps(colors: ChartColors) {
  return {
    tickLine: false,
    axisLine: false,
    tick: { fill: colors.muted, fontSize: 11 },
  } as const;
}

export function gridProps(colors: ChartColors) {
  return {
    strokeDasharray: "2 6",
    stroke: colors.grid,
    vertical: false,
  } as const;
}

export function legendProps(colors: ChartColors) {
  return {
    iconType: "circle" as const,
    iconSize: 7,
    wrapperStyle: { fontSize: 11, color: colors.muted, paddingTop: 8 },
  };
}

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
