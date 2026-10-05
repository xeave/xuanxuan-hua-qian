import type { Expense, MonthKey } from "./types";

export function monthFromDate(iso: string): string {
  return iso.slice(0, 7);
}

export function isCalendarMonth(key: string): boolean {
  return /^\d{4}-\d{2}$/.test(key);
}

export function periodKey(expense: Expense): string {
  return expense.book || monthFromDate(expense.date);
}

export function formatMonthLabel(month: MonthKey): string {
  if (month === "all") return "全部";
  if (!isCalendarMonth(month)) return month;
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
  if (!isCalendarMonth(month)) return month;
  return `${Number(month.slice(5, 7))}月`;
}

export function splitYuan(n: number): { int: string; dec: string } {
  const [int, dec] = formatNumber(n).split(".");
  return { int, dec: dec ?? "00" };
}

export function daysInView(month: MonthKey, expenses: Expense[]): number {
  if (month === "all" || !isCalendarMonth(month)) {
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
  const keys = [...new Set(expenses.map(periodKey))];
  const lastDate = new Map<string, string>();
  for (const item of expenses) {
    const key = periodKey(item);
    const prev = lastDate.get(key);
    if (!prev || item.date > prev) lastDate.set(key, item.date);
  }
  return keys.sort((a, b) => {
    const aDate = isCalendarMonth(a) ? `${a}-99` : (lastDate.get(a) ?? a);
    const bDate = isCalendarMonth(b) ? `${b}-99` : (lastDate.get(b) ?? b);
    return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
  });
}

export function defaultMonthKey(expenses: Expense[]): MonthKey {
  const months = navigableMonths(expenses);
  return months[months.length - 1] ?? "all";
}
