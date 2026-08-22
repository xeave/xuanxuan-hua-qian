import type { Expense, MonthKey } from "./types";

export function currentMonthKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthFromDate(iso: string): string {
  return iso.slice(0, 7);
}

export function formatMonthLabel(month: MonthKey): string {
  if (month === "all") return "全部";
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function formatDayHeading(iso: string, showYear: boolean): string {
  const [, m, d] = iso.split("-");
  const body = `${Number(m)}月${Number(d)}日`;
  const dt = new Date(`${iso}T00:00:00`);
  const week = Number.isNaN(dt.getTime()) ? "" : ` 周${WEEKDAYS[dt.getDay()]}`;
  return `${showYear ? `${iso.slice(0, 4)}年` : ""}${body}${week}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatYuan(n: number): string {
  return `¥${formatNumber(n)}`;
}

export function formatCompact(n: number): string {
  if (n >= 10000) {
    const wan = n / 10000;
    const text = wan >= 10 ? wan.toFixed(0) : wan.toFixed(1).replace(/\.0$/, "");
    return `${text}万`;
  }
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatPercent(share: number): string {
  const pct = Math.round(share * 1000) / 10;
  return `${Number.isInteger(pct) ? String(pct) : pct.toFixed(1)}%`;
}

export function formatShortMonth(month: string): string {
  return `${Number(month.slice(5, 7))}月`;
}

export function splitYuan(n: number): { int: string; dec: string } {
  const [int, dec] = formatNumber(n).split(".");
  return { int, dec: dec ?? "00" };
}

export function daysInView(month: MonthKey, expenses: Expense[]): number {
  if (month === "all") {
    return new Set(expenses.map((e) => e.date)).size || 1;
  }
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function dailyAverage(
  total: number,
  month: MonthKey,
  expenses: Expense[],
): number {
  return total / daysInView(month, expenses);
}

export function navigableMonths(expenses: Expense[]): string[] {
  return [...new Set(expenses.map((e) => monthFromDate(e.date)))].sort();
}

export function defaultMonthKey(
  expenses: Expense[],
  fallback = currentMonthKey(),
): string {
  const months = navigableMonths(expenses);
  return months[months.length - 1] ?? fallback;
}
