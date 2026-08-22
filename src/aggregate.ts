import { monthFromDate } from "./format";
import type { Expense, MonthKey } from "./types";

export type CategoryTotal = {
  category: string;
  amount: number;
  count: number;
  share: number;
};

export type DayGroup = {
  date: string;
  total: number;
  items: Expense[];
};

export function filterExpenses(
  expenses: Expense[],
  month: MonthKey,
  category: string | null,
): Expense[] {
  return expenses.filter((e) => {
    if (month !== "all" && monthFromDate(e.date) !== month) return false;
    if (category && e.category !== category) return false;
    return true;
  });
}

export function sumAmount(expenses: Expense[]): number {
  return expenses.reduce((s, e) => s + e.amount, 0);
}

export function byCategory(expenses: Expense[]): CategoryTotal[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const e of expenses) {
    const cur = map.get(e.category) ?? { amount: 0, count: 0 };
    cur.amount += e.amount;
    cur.count += 1;
    map.set(e.category, cur);
  }
  const total = sumAmount(expenses) || 1;
  return [...map.entries()]
    .map(([category, v]) => ({
      category,
      amount: v.amount,
      count: v.count,
      share: v.amount / total,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type MonthTotal = {
  month: string;
  amount: number;
  count: number;
};

export function yearsInData(expenses: Expense[]): string[] {
  return [...new Set(expenses.map((e) => e.date.slice(0, 4)))].sort();
}

export function filterByYear(expenses: Expense[], year: string | "all"): Expense[] {
  if (year === "all") return expenses;
  return expenses.filter((e) => e.date.startsWith(year));
}

export function byMonth(expenses: Expense[]): MonthTotal[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const e of expenses) {
    const month = monthFromDate(e.date);
    const cur = map.get(month) ?? { amount: 0, count: 0 };
    cur.amount += e.amount;
    cur.count += 1;
    map.set(month, cur);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, v]) => ({ month, amount: v.amount, count: v.count }));
}

export function daysInSpan(expenses: Expense[]): number {
  if (!expenses.length) return 1;
  const dates = expenses.map((e) => e.date).sort();
  const start = new Date(`${dates[0]}T00:00:00`).getTime();
  const end = new Date(`${dates[dates.length - 1]}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

export function maxExpense(expenses: Expense[]): Expense | null {
  if (!expenses.length) return null;
  return expenses.reduce((max, e) => (e.amount > max.amount ? e : max));
}

export function byDay(expenses: Expense[]): DayGroup[] {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      total: sumAmount(items),
      items,
    }));
}
