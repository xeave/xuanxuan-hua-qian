import { parseCsv } from "./parse";
import { clearStoredExpenses, loadStoredExpenses, resetLegacyBrowserLedger } from "./store";
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
  return `${e.book}|${e.date}|${e.category}|${e.amount}|${e.note}|${e.payMethod}`;
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
  "2026-07-30|餐饮|58|晚饭 烧烤|支付宝",
  "2026-07-28|日用|210|超市囤货|银行卡",
  "2026-07-25|餐饮|16|早饭|微信",
  "2026-07-22|交通|36|打车去车站|微信",
  "2026-07-20|娱乐|99|展览门票|支付宝",
  "2026-07-18|餐饮|72|午饭 同事聚餐|支付宝",
  "2026-07-15|医疗|48|体检复查挂号|微信",
  "2026-07-12|日用|24|纸巾洗衣液|微信",
  "2026-07-10|餐饮|19.9|咖啡|微信",
  "2026-07-08|交通|6|地铁|微信",
  "2026-07-06|住房|150|宽带|银行卡",
  "2026-07-04|餐饮|33|晚饭|支付宝",
  "2026-06-28|餐饮|41|午饭|支付宝",
  "2026-06-25|娱乐|88|演唱会周边|微信",
  "2026-06-22|交通|27|打车|微信",
  "2026-06-18|日用|63.8|水果零食|微信",
  "2026-06-15|餐饮|22|早饭+咖啡|微信",
  "2026-06-12|医疗|18|创可贴创可贴不够又买了|微信",
  "2026-06-08|餐饮|55|晚饭|支付宝",
  "2026-06-03|交通|9|公交|微信",
]);

function isDemoLedger(stored: Expense[]): boolean {
  if (!stored.length) return false;
  const hit = stored.filter((item) => RETIRED_SAMPLE_KEYS.has(expenseKey(item))).length;
  if (hit === stored.length) return true;
  if (hit >= 8 && hit / stored.length >= 0.7) return true;
  const august = stored.filter((item) => item.date.startsWith("2026-08"));
  const augustTotal = august.reduce((sum, item) => sum + item.amount, 0);
  if (august.length === 18 && Math.abs(augustTotal - 788.5) < 0.05) return true;
  return stored.some(
    (item) =>
      item.note === "午饭 面馆" ||
      item.note === "地铁月通勤补票" ||
      item.note === "创可贴创可贴不够又买了",
  );
}

export async function loadLedger(): Promise<LoadedLedger> {
  await resetLegacyBrowserLedger();

  const stored = await loadStoredExpenses();
  if (stored?.length && !isDemoLedger(stored)) {
    return { expenses: stored, source: "indexeddb" };
  }
  if (stored?.length) {
    await clearStoredExpenses();
  }

  const monthTexts = await Promise.all(localCsvUrls().map(tryFetchCsv));
  const expenses: Expense[] = [];
  const seen = new Set<string>();
  const add = (item: Expense): void => {
    const key = expenseKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    expenses.push(item);
  };
  for (const text of monthTexts) {
    if (!text) continue;
    for (const item of parseCsv(text).expenses) add(item);
  }
  if (expenses.length) {
    expenses.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { expenses, source: "local-file" };
  }

  return { expenses: [], source: "empty" };
}
