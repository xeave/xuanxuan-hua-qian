import { parseCsv } from "./parse";
import { loadStoredExpenses } from "./store";
import type { DataSource, Expense } from "./types";

export type LoadedLedger = {
  expenses: Expense[];
  source: DataSource;
};

async function tryFetchCsv(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (type.includes("text/html")) return null;
    const text = await res.text();
    const start = text.trimStart();
    if (!start || start.startsWith("<!") || start.startsWith("<html")) return null;
    return text;
  } catch {
    return null;
  }
}

function monthStamp(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function localCsvUrls(): string[] {
  const urls = ["./data/expenses.csv"];
  const cursor = new Date(2024, 0, 1);
  const end = new Date();
  end.setMonth(end.getMonth() + 1);
  while (cursor <= end) {
    urls.push(`./data/${monthStamp(cursor)}.csv`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return urls;
}

export function expenseKey(e: Expense): string {
  return `${e.date}|${e.category}|${e.amount}|${e.note}|${e.payMethod}`;
}

export async function loadLedger(): Promise<LoadedLedger> {
  const texts = await Promise.all(localCsvUrls().map(tryFetchCsv));
  const expenses: Expense[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const item of parseCsv(text).expenses) {
      const key = expenseKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      expenses.push(item);
    }
  }
  if (expenses.length) {
    expenses.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { expenses, source: "local-file" };
  }

  const stored = await loadStoredExpenses();
  if (stored?.length) {
    return { expenses: stored, source: "indexeddb" };
  }

  const sampleText = await tryFetchCsv("./data/sample.csv");
  if (sampleText) {
    const parsed = parseCsv(sampleText);
    return { expenses: parsed.expenses, source: "sample" };
  }

  return { expenses: [], source: "sample" };
}
