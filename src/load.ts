import { parseCsv } from "./parse";
import { clearStoredExpenses, loadStoredExpenses } from "./store";
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

const RETIRED_SAMPLE_KEYS = new Set([
  "2026-08-21|餐饮|32|午饭 面馆|支付宝",
  "2026-08-21|餐饮|18|咖啡|微信",
  "2026-08-21|交通|6|地铁|微信",
  "2026-08-20|餐饮|68|晚饭 火锅|支付宝",
  "2026-08-19|交通|28|打车回家|微信",
  "2026-08-18|日用|86.5|超市采购|银行卡",
  "2026-08-17|餐饮|15|早饭 包子|微信",
  "2026-08-16|娱乐|80|电影|支付宝",
  "2026-08-15|餐饮|45|外卖|美团",
  "2026-08-14|住房|120|水电费|银行卡",
  "2026-08-13|交通|2|共享单车|支付宝",
  "2026-08-12|日用|35|洗发水|微信",
  "2026-08-11|餐饮|42|午饭 简餐|支付宝",
  "2026-08-10|医疗|45|药店 感冒药|微信",
  "2026-08-08|餐饮|26|奶茶|微信",
  "2026-08-06|娱乐|90|游戏会员|支付宝",
  "2026-08-04|餐饮|38|晚饭 食堂|微信",
  "2026-08-02|交通|12|地铁月通勤补票|微信",
]);

function isDemoLedger(stored: Expense[], sample: Expense[]): boolean {
  if (!stored.length) return false;
  const demoKeys = new Set([...sample.map(expenseKey), ...RETIRED_SAMPLE_KEYS]);
  return stored.every((item) => demoKeys.has(expenseKey(item)));
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

  const sampleText = await tryFetchCsv(`./data/sample.csv?v=20260822`);
  const sample = sampleText ? parseCsv(sampleText).expenses : [];
  const stored = await loadStoredExpenses();
  if (stored?.length && !isDemoLedger(stored, sample)) {
    return { expenses: stored, source: "indexeddb" };
  }
  if (stored?.length) {
    void clearStoredExpenses();
  }

  if (sample.length) {
    return { expenses: sample, source: "sample" };
  }

  return { expenses: [], source: "sample" };
}
