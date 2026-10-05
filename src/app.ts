import {
  byCategory,
  byDay,
  byMonth,
  daysInSpan,
  filterByYear,
  filterExpenses,
  maxExpense,
  sumAmount,
  yearsInData,
} from "./aggregate";
import type { CategoryTotal } from "./aggregate";
import { categoryColor } from "./colors";
import { el } from "./dom";
import {
  dailyAverage,
  defaultMonthKey,
  formatCompact,
  formatDayHeading,
  formatMonthLabel,
  formatNumber,
  formatPercent,
  formatShortMonth,
  formatYuan,
  isCalendarMonth,
  navigableMonths,
  splitYuan,
} from "./format";
import { expenseKey, loadLedger } from "./load";
import { decodeCsvBytes, parseCsv } from "./parse";
import { saveExpenses } from "./store";
import type { Banner, DataSource, Expense, MonthKey } from "./types";

type View = "ledger" | "stats";

type State = {
  expenses: Expense[];
  source: DataSource;
  month: MonthKey;
  category: string | null;
  banner: Banner | null;
  openItem: Expense | null;
  view: View;
  year: string | "all";
};

function requireApp(): HTMLElement {
  const node = document.querySelector("#app");
  if (!(node instanceof HTMLElement)) throw new Error("#app missing");
  return node;
}

const root = requireApp();

const fileInput = el("input", {
  class: "file-input",
  id: "csv-import",
  type: "file",
  accept: "*/*",
  multiple: "multiple",
});
fileInput.addEventListener("change", () => {
  const files = [...(fileInput.files ?? [])];
  fileInput.value = "";
  if (files.length) void importFiles(files);
});

const state: State = {
  expenses: [],
  source: "empty",
  month: defaultMonthKey([]),
  category: null,
  banner: null,
  openItem: null,
  view: "ledger",
  year: "all",
};

function monthExpenses(): Expense[] {
  return filterExpenses(state.expenses, state.month, null);
}

function visibleExpenses(): Expense[] {
  return filterExpenses(state.expenses, state.month, state.category);
}

function tinted(node: HTMLElement, category: string): void {
  node.style.setProperty("--cat", categoryColor(category));
}

function catIcon(category: string): HTMLElement {
  const icon = el("span", { class: "cat-icon" }, [category.slice(0, 1)]);
  tinted(icon, category);
  return icon;
}

function coverageNote(): string | null {
  const months = navigableMonths(state.expenses);
  if (!months.length) return null;
  if (state.source === "local-file") {
    return `${formatMonthLabel(months[0])} – ${formatMonthLabel(months[months.length - 1])} · 本地`;
  }
  return null;
}

function hasSavedLedger(): boolean {
  return state.source !== "empty" && state.expenses.length > 0;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function exportLedger(): void {
  if (!hasSavedLedger()) return;
  const lines = ["日期,账目明细,金额,备注,支付方式"];
  const rows = [...state.expenses].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const item of rows) {
    lines.push(
      [
        item.date,
        csvCell(item.category),
        String(item.amount),
        csvCell(item.note),
        csvCell(item.payMethod),
      ].join(","),
    );
  }
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: "花销账本.csv" });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderNavActions(): HTMLElement {
  const wrap = el("div", { class: "nav-actions" });
  wrap.append(el("label", { class: "nav-action", for: "csv-import" }, ["导入"]));
  if (hasSavedLedger()) {
    const button = el("button", { class: "nav-action", type: "button" }, ["导出"]);
    button.addEventListener("click", exportLedger);
    wrap.append(button);
  }
  return wrap;
}

function renderPageHead(title: string): HTMLElement {
  return el("header", { class: "nav" }, [
    el("span", { class: "nav-side" }),
    el("h1", { class: "nav-title" }, [title]),
    renderNavActions(),
  ]);
}

async function importFiles(files: File[]): Promise<void> {
  const expenses: Expense[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  if (hasSavedLedger()) {
    for (const item of state.expenses) {
      seen.add(expenseKey(item));
      expenses.push(item);
    }
  }
  for (const file of files) {
    const text = decodeCsvBytes(await file.arrayBuffer());
    const result = parseCsv(text);
    if (!result.expenses.length) {
      errors.push(`${file.name || "未命名文件"}：${result.errors[0]?.message || "没有解析到花销"}`);
      continue;
    }
    for (const item of result.expenses) {
      const key = expenseKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      expenses.push(item);
    }
  }
  const baseCount = hasSavedLedger() ? state.expenses.length : 0;
  if (expenses.length <= baseCount) {
    state.banner = { kind: "error", text: errors[0] || "导入失败，请在文件 App 里选导出的 CSV" };
    paint();
    return;
  }
  expenses.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  try {
    await saveExpenses(expenses);
  } catch {
    errors.push("手机没能记住这笔账，关掉网页后可能要再导入一次");
  }
  state.expenses = expenses;
  state.source = "indexeddb";
  state.category = null;
  state.month = defaultMonthKey(expenses);
  state.year = "all";
  state.view = "ledger";
  const extra = errors.length ? `。${errors.join("；")}` : "";
  state.banner = {
    kind: "success",
    text: `已导入 ${expenses.length} 笔${extra}`,
  };
  paint();
  window.scrollTo(0, 0);
}

function goMonth(delta: number): void {
  const months = navigableMonths(state.expenses);
  const from = state.month === "all" ? defaultMonthKey(state.expenses) : state.month;
  const idx = months.indexOf(from);
  const next = months[idx + delta];
  if (!next) return;
  state.month = next;
  state.category = null;
  state.openItem = null;
  render();
}

let listScroll = 0;

function openMemo(item: Expense): void {
  listScroll = window.scrollY;
  state.openItem = item;
  paint();
  window.scrollTo(0, 0);
}

function closeSheet(): void {
  state.openItem = null;
  render();
  window.scrollTo(0, listScroll);
}

function clipNote(note: string): string {
  const text = note.replace(/\s+/g, " ").trim();
  if (!text) return "没有备注";
  return text.length > 18 ? `${text.slice(0, 18)}…` : text;
}

function tabIcon(kind: "ledger" | "stats"): HTMLElement {
  const wrap = el("span", { class: "tab-icon" });
  wrap.innerHTML =
    kind === "ledger"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2.2"/><path d="M8 8.5h8M8 12.5h8M8 16.5h5"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V10M10 19V5M16 19v-6"/><path d="M3 19h18"/></svg>';
  return wrap;
}

function renderTab(kind: "ledger" | "stats", label: string): HTMLButtonElement {
  const on = state.view === kind;
  const button = el("button", {
    class: on ? "tab is-on" : "tab",
    type: "button",
    "aria-current": on ? "page" : "false",
  });
  button.append(tabIcon(kind), el("span", { class: "tab-label" }, [label]));
  return button;
}

function renderTabs(): HTMLElement {
  const bar = el("nav", { class: "tabbar", "aria-label": "页面" });
  const ledger = renderTab("ledger", "账单");
  const stats = renderTab("stats", "统计");
  ledger.addEventListener("click", () => {
    state.view = "ledger";
    state.openItem = null;
    state.month = defaultMonthKey(state.expenses);
    state.category = null;
    paint();
    window.scrollTo(0, 0);
  });
  stats.addEventListener("click", () => {
    state.view = "stats";
    state.openItem = null;
    paint();
    window.scrollTo(0, 0);
  });
  bar.append(ledger, stats);
  return bar;
}

function memoRow(label: string, value: string, wide = false): HTMLElement {
  return el("div", { class: wide ? "memo-row memo-row-wide" : "memo-row" }, [
    el("span", { class: "memo-row-label" }, [label]),
    el("span", { class: "memo-row-value" }, [value]),
  ]);
}

function renderMemo(item: Expense): HTMLElement {
  const page = el("div", { class: "memo" });
  const back = el("button", { class: "memo-back", type: "button" }, ["‹ 返回"]);
  back.addEventListener("click", closeSheet);
  const title = item.note.trim() || item.category;
  const parts = splitYuan(item.amount);
  const icon = catIcon(item.category);
  icon.className = "memo-icon";
  const rows = el("section", { class: "memo-card" });
  rows.append(
    memoRow("分类", item.category),
    memoRow("时间", formatDayHeading(item.date, true)),
    memoRow("支付", item.payMethod.trim() || "未填写"),
    memoRow("金额", formatYuan(item.amount)),
    memoRow("备注", item.note.trim() || "没有写备注", true),
  );
  page.append(
    el("div", { class: "memo-head" }, [
      el("header", { class: "memo-nav" }, [
        back,
        el("h1", { class: "memo-title" }, ["详情"]),
        el("span", { class: "memo-nav-space" }),
      ]),
      el("div", { class: "memo-hero" }, [
        icon,
        el("div", { class: "memo-amount" }, [
          el("span", { class: "memo-yen" }, ["-¥"]),
          el("span", { class: "memo-int" }, [parts.int]),
          el("span", { class: "memo-dec" }, [`.${parts.dec}`]),
        ]),
        el("div", { class: "memo-summary" }, [title]),
      ]),
    ]),
    rows,
  );
  return page;
}

function renderCategories(rows: CategoryTotal[]): HTMLElement {
  const card = el("section", { class: "card" });
  const head = el("div", { class: "card-head" }, [
    el("h2", { class: "card-title" }, ["花在哪"]),
    el("span", { class: "card-meta" }, [`${rows.length} 类`]),
  ]);
  if (state.category) {
    const clear = el("button", { class: "link", type: "button" }, ["取消筛选"]);
    clear.addEventListener("click", () => {
      state.category = null;
      render();
    });
    head.append(clear);
  }
  card.append(head);

  if (!rows.length) {
    card.append(el("p", { class: "empty" }, ["这个月没有支出"]));
    return card;
  }

  for (const row of rows) {
    const on = state.category === row.category;
    const btn = el("button", { class: on ? "cat is-on" : "cat", type: "button" });
    btn.style.setProperty("--cat", categoryColor(row.category));
    const bar = el("span", { class: "cat-bar" }, [el("i")]);
    (bar.firstChild as HTMLElement).style.width = `${Math.max(row.share * 100, 1.5)}%`;
    btn.append(
      catIcon(row.category),
      el("span", { class: "cat-main" }, [
        el("span", { class: "cat-top" }, [
          el("span", { class: "cat-name" }, [row.category]),
          el("span", { class: "cat-amount" }, [formatYuan(row.amount)]),
        ]),
        bar,
      ]),
      el("span", { class: "cat-pct" }, [formatPercent(row.share)]),
    );
    btn.addEventListener("click", () => {
      if (state.view === "stats") {
        state.view = "ledger";
        state.month = "all";
        state.category = row.category;
        paint();
        window.scrollTo(0, 0);
        return;
      }
      state.category = state.category === row.category ? null : row.category;
      paint();
    });
    card.append(btn);
  }
  return card;
}

function spendingPersona(top: CategoryTotal | undefined): {
  emoji: string;
  title: string;
  copy: string;
} {
  const personas: Record<string, [string, string]> = {
    餐饮: ["🍜", "人间烟火收藏家"],
    零食: ["🍿", "快乐零食补给官"],
    买菜: ["🥬", "认真生活料理家"],
    交通: ["🛣️", "永远在路上"],
    汽车: ["🚗", "公路生活体验派"],
    住房: ["🏠", "舒适区建筑师"],
    房租水电: ["🛋️", "安稳生活守护者"],
    娱乐: ["🎡", "快乐充值专家"],
    旅游: ["🧳", "世界体验收藏家"],
    日用: ["🪴", "生活细节主理人"],
    服饰: ["👕", "氛围感造型师"],
    医疗: ["🩹", "健康优先行动派"],
  };
  const [emoji, title] = personas[top?.category ?? ""] ?? ["✨", "随心生活探索家"];
  const pct = top ? Math.round(top.share * 100) : 0;
  return {
    emoji,
    title,
    copy: top
      ? `每花 100 元，约有 ${pct} 元奔向「${top.category}」`
      : "花钱不是消失，是换一种方式陪伴生活",
  };
}

function renderFunStats(
  scoped: Expense[],
  categories: CategoryTotal[],
  total: number,
): HTMLElement | null {
  if (!scoped.length) return null;

  const top = categories[0];
  const persona = spendingPersona(top);
  const days = byDay(scoped);
  const wildDay = days.reduce((best, day) => (day.total > best.total ? day : best), days[0]);
  const busyDay = days.reduce(
    (best, day) => (day.items.length > best.items.length ? day : best),
    days[0],
  );
  const biggest = maxExpense(scoped);
  const uniqueDates = [...new Set(scoped.map((item) => item.date))].sort();
  let streak = uniqueDates.length ? 1 : 0;
  let running = streak;
  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previous = new Date(`${uniqueDates[index - 1]}T00:00:00`).getTime();
    const current = new Date(`${uniqueDates[index]}T00:00:00`).getTime();
    running = current - previous === 86400000 ? running + 1 : 1;
    streak = Math.max(streak, running);
  }

  const noteCounts = new Map<string, number>();
  for (const item of scoped) {
    const note = item.note.replace(/\s+/g, " ").trim();
    if (note.length < 2) continue;
    noteCounts.set(note, (noteCounts.get(note) ?? 0) + 1);
  }
  const regular = [...noteCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topShare = Math.round((top?.share ?? 0) * 100);

  const report = el("section", { class: "editorial-report" }, [
    el("div", { class: "report-mast" }, [
      el("span", {}, ["SPENDING FIELD NOTES"]),
      el("span", {}, [`NO.${String(scoped.length).padStart(3, "0")}`]),
    ]),
  ]);

  const cover = el("article", { class: "report-cover" }, [
    el("div", { class: "report-cover-orbit" }),
    el("div", { class: "report-cover-top" }, [
      el("span", {}, ["你的消费主角"]),
      el("b", {}, [`${topShare}%`]),
    ]),
    el("div", { class: "report-cover-word" }, [top?.category ?? "生活"]),
    el("div", { class: "report-cover-bottom" }, [
      el("span", { class: "report-persona-emoji" }, [persona.emoji]),
      el("div", {}, [
        el("strong", {}, [persona.title]),
        el("span", {}, [persona.copy]),
      ]),
    ]),
    el("div", { class: "report-cover-total" }, [
      el("span", {}, [`${scoped.length} 次选择`]),
      el("b", {}, [formatYuan(total)]),
    ]),
  ]);

  const categoryRail = el("div", { class: "report-category-rail" });
  categories.slice(0, 5).forEach((row, index) => {
    const item = el("div", { class: "report-category-item" }, [
      el("span", {}, [`0${index + 1}`]),
      el("strong", {}, [row.category]),
      el("b", {}, [formatPercent(row.share)]),
    ]);
    item.style.setProperty("--rail-color", categoryColor(row.category));
    categoryRail.append(item);
  });

  const story = el("article", { class: "report-story" }, [
    el("span", { class: "report-story-index" }, ["01 / MONEY RHYTHM"]),
    el("p", {}, [
      `在 ${days.length} 个有消费的日子里，`,
      el("strong", {}, [`${wildDay.date.slice(5).replace("-", "月")}日`]),
      ` 最舍得花，单日留下了 `,
      el("strong", {}, [formatYuan(wildDay.total)]),
      " 的生活痕迹。",
    ]),
  ]);

  const records = el("div", { class: "report-records" }, [
    el("article", { class: "report-record report-record-dark" }, [
      el("span", {}, ["单笔冠军"]),
      el("strong", {}, [biggest ? formatYuan(biggest.amount) : "—"]),
      el("p", {}, [biggest ? clipNote(biggest.note) : "没有记录"]),
      el("b", {}, ["BIGGEST"]),
    ]),
    el("article", { class: "report-record report-record-acid" }, [
      el("span", {}, ["最忙一天"]),
      el("strong", {}, [`${busyDay.items.length} 笔`]),
      el("p", {}, [formatDayHeading(busyDay.date, false).replace(/\s周.$/, "")]),
      el("b", {}, ["BUSIEST"]),
    ]),
    el("article", { class: "report-record report-record-paper" }, [
      el("span", {}, ["最长连续记录"]),
      el("strong", {}, [`${streak} 天`]),
      el("p", {}, [`一共点亮 ${days.length} 个消费日`]),
      el("b", {}, ["STREAK"]),
    ]),
    el("article", { class: "report-record report-record-pink" }, [
      el("span", {}, ["账单常客"]),
      el("strong", {}, [regular && regular[1] > 1 ? `${regular[1]} 次` : "仅此一次"]),
      el("p", {}, [regular && regular[1] > 1 ? clipNote(regular[0]) : "每一笔都不重样"]),
      el("b", {}, ["REGULAR"]),
    ]),
  ]);

  const fingerprint = el("article", { class: "report-fingerprint" }, [
    el("div", { class: "report-fingerprint-head" }, [
      el("span", {}, ["02 / SPENDING DNA"]),
      el("b", {}, ["消费构成"]),
    ]),
  ]);
  const lines = el("div", { class: "report-fingerprint-lines" });
  categories.slice(0, 6).forEach((row) => {
    const fill = el("i");
    fill.style.width = `${Math.max(row.share * 100, 3)}%`;
    fill.style.background = categoryColor(row.category);
    lines.append(
      el("div", { class: "report-fingerprint-line" }, [
        el("span", {}, [row.category]),
        el("div", {}, [fill]),
        el("b", {}, [formatYuan(row.amount)]),
      ]),
    );
  });
  fingerprint.append(lines);

  report.append(
    cover,
    categoryRail,
    story,
    records,
    fingerprint,
    el("div", { class: "report-signoff" }, [
      el("span", {}, ["THE VERDICT"]),
      el("strong", {}, [
        top
          ? `你不是在乱花钱，你只是在认真投票给「${top.category}」。`
          : "每一笔花销，都在替生活投票。",
      ]),
    ]),
  );
  return report;
}

function renderStats(): void {
  const scoped = filterByYear(state.expenses, state.year);
  const total = sumAmount(scoped);
  const parts = splitYuan(total);
  const months = byMonth(scoped);
  const categories = byCategory(scoped);
  const peak = months.reduce(
    (best, row) => (row.amount > best.amount ? row : best),
    months[0] ?? { month: "", amount: 0, count: 0 },
  );
  const biggest = maxExpense(scoped);
  const top = categories[0];
  const avg = scoped.length ? total / daysInSpan(scoped) : 0;
  const years = yearsInData(state.expenses);
  const maxBar = Math.max(...months.map((row) => row.amount), 1);

  const nav = renderPageHead("统计");

  if (!state.expenses.length) {
    const emptyPage = el("div", { class: "page" }, [
      el("div", { class: "masthead" }, [nav]),
      el("section", { class: "card" }, [
        el("p", { class: "empty" }, ["还没有数据，点右上角导入 Numbers 导出的 CSV"]),
      ]),
      renderTabs(),
    ]);
    root.replaceChildren(emptyPage, fileInput);
    return;
  }

  const yearsRow = el("div", { class: "years" });
  const allYear = el(
    "button",
    { class: state.year === "all" ? "year is-on" : "year", type: "button" },
    ["全部"],
  );
  allYear.addEventListener("click", () => {
    state.year = "all";
    paint();
  });
  yearsRow.append(allYear);
  for (const year of years) {
    const btn = el(
      "button",
      { class: state.year === year ? "year is-on" : "year", type: "button" },
      [year],
    );
    btn.addEventListener("click", () => {
      state.year = year;
      paint();
    });
    yearsRow.append(btn);
  }

  const hero = el("section", { class: "hero" }, [
    el("div", { class: "hero-kicker" }, [
      state.year === "all" ? "全部支出" : `${state.year} 年支出`,
    ]),
    el("div", { class: "hero-amount" }, [
      el("span", { class: "hero-yen" }, ["¥"]),
      el("span", { class: "hero-int" }, [parts.int]),
      el("span", { class: "hero-dec" }, [`.${parts.dec}`]),
    ]),
    el("div", { class: "hero-metrics" }, [
      el("div", { class: "hero-metric" }, [
        el("div", { class: "hero-metric-label" }, ["笔数"]),
        el("div", { class: "hero-metric-value" }, [`${scoped.length} 笔`]),
      ]),
      el("div", { class: "hero-metric" }, [
        el("div", { class: "hero-metric-label" }, ["日均"]),
        el("div", { class: "hero-metric-value" }, [formatYuan(avg)]),
      ]),
    ]),
  ]);
  const page = el("div", { class: "page" }, [
    el("div", { class: "masthead" }, [nav, yearsRow, hero]),
  ]);

  const funStats = renderFunStats(scoped, categories, total);
  if (funStats) page.append(funStats);

  const trend = el("section", { class: "card" }, [
    el("div", { class: "card-head" }, [
      el("h2", { class: "card-title" }, ["月份走势"]),
      el("span", { class: "card-meta" }, ["点柱子看当月"]),
    ]),
  ]);
  if (!months.length) {
    trend.append(el("p", { class: "empty" }, ["这段时间没有支出"]));
  } else {
    const bars = el("div", { class: "bars" });
    for (const row of months) {
      const col = el("button", { class: row.month === peak.month ? "bar is-peak" : "bar", type: "button" });
      const fill = el("span", { class: "bar-fill" });
      fill.style.height = `${Math.max((row.amount / maxBar) * 120, 4)}px`;
      col.append(
        el("span", { class: "bar-value" }, [formatCompact(row.amount)]),
        fill,
        el("span", { class: "bar-label" }, [formatShortMonth(row.month)]),
      );
      col.addEventListener("click", () => {
        state.view = "ledger";
        state.month = row.month;
        state.category = null;
        state.openItem = null;
        paint();
        window.scrollTo(0, 0);
      });
      bars.append(col);
    }
    trend.append(bars);
  }
  page.append(trend);

  const insight = el("section", { class: "insights" });
  if (peak.month) {
    const card = el("button", { class: "insight", type: "button" });
    card.append(
      el("div", { class: "insight-label" }, ["最花钱的月"]),
      el("div", { class: "insight-value" }, [formatMonthLabel(peak.month)]),
      el("div", { class: "insight-sub" }, [formatYuan(peak.amount)]),
    );
    card.addEventListener("click", () => {
      state.view = "ledger";
      state.month = peak.month;
      state.category = null;
      paint();
      window.scrollTo(0, 0);
    });
    insight.append(card);
  }
  if (top) {
    const card = el("button", { class: "insight", type: "button" });
    card.append(
      el("div", { class: "insight-label" }, ["花得最多"]),
      el("div", { class: "insight-value" }, [top.category]),
      el("div", { class: "insight-sub" }, [
        `${formatPercent(top.share)} · ${formatYuan(top.amount)}`,
      ]),
    );
    card.addEventListener("click", () => {
      state.view = "ledger";
      state.month = "all";
      state.category = top.category;
      paint();
      window.scrollTo(0, 0);
    });
    insight.append(card);
  }
  if (biggest) {
    const card = el("button", { class: "insight", type: "button" });
    card.append(
      el("div", { class: "insight-label" }, ["最大一笔"]),
      el("div", { class: "insight-value" }, [formatYuan(biggest.amount)]),
      el("div", { class: "insight-sub" }, [clipNote(biggest.note)]),
    );
    card.addEventListener("click", () => openMemo(biggest));
    insight.append(card);
  }
  if (insight.childElementCount) page.append(insight);

  if (categories.length) {
    const catCard = renderCategories(categories);
    const title = catCard.querySelector(".card-title");
    if (title) title.textContent = "分类结构";
    page.append(catCard);
  }

  page.append(renderTabs());
  root.replaceChildren(page, fileInput);
}

function render(): void {
  const monthList = monthExpenses();
  const visible = visibleExpenses();
  const categories = byCategory(monthList);
  const groups = byDay(visible);
  const total = sumAmount(monthList);
  const avg = dailyAverage(total, state.month, monthList);
  const months = navigableMonths(state.expenses);
  const monthForNav =
    state.month === "all" ? defaultMonthKey(state.expenses) : state.month;
  const navIndex = months.indexOf(monthForNav);
  const prevDisabled = state.month === "all" || navIndex <= 0;
  const nextDisabled = state.month === "all" || navIndex < 0 || navIndex >= months.length - 1;
  const showYear = state.month === "all";
  const note = coverageNote();

  const nav = renderPageHead("账单");

  if (!state.expenses.length) {
    const page = el("div", { class: "page" }, [
      el("div", { class: "masthead" }, [nav]),
    ]);
    if (state.banner && (state.banner.kind === "error" || state.banner.kind === "success")) {
      page.append(
        el("p", { class: `toast toast-${state.banner.kind}` }, [state.banner.text]),
      );
    }
    page.append(
      el("section", { class: "card" }, [
        el("p", { class: "empty" }, ["还没有数据，点右上角导入 Numbers 导出的 CSV"]),
      ]),
      renderTabs(),
    );
    root.replaceChildren(page, fileInput);
    return;
  }

  const period = el("div", { class: "period" });
  const prev = el("button", { class: "period-btn", type: "button", "aria-label": "上个月" }, ["‹"]);
  if (prevDisabled) prev.disabled = true;
  prev.addEventListener("click", () => goMonth(-1));
  const next = el("button", { class: "period-btn", type: "button", "aria-label": "下个月" }, ["›"]);
  if (nextDisabled) next.disabled = true;
  next.addEventListener("click", () => goMonth(1));
  const pick = el("label", { class: "period-pick" });
  const select = el("select", { class: "period-select" }) as HTMLSelectElement;
  const allOpt = el("option", { value: "all" }, ["全部月份"]);
  if (state.month === "all") allOpt.selected = true;
  select.append(allOpt);
  for (const month of [...months].reverse()) {
    const opt = el("option", { value: month }, [formatMonthLabel(month)]);
    if (state.month === month) opt.selected = true;
    select.append(opt);
  }
  select.addEventListener("change", () => {
    state.month = (select.value || "all") as MonthKey;
    state.category = null;
    state.openItem = null;
    paint();
    window.scrollTo(0, 0);
  });
  pick.append(select);
  const switcher = el("div", { class: "period-switch" });
  switcher.append(prev, pick, next);
  period.append(switcher);

  if (state.banner && (state.banner.kind === "error" || state.banner.kind === "success")) {
    // shown under header
  }

  const parts = splitYuan(total);
  const hero = el("section", { class: "hero" }, [
    el("div", { class: "hero-kicker" }, [
      state.month === "all"
        ? "全部支出"
        : isCalendarMonth(state.month)
          ? "本月支出"
          : `${state.month}`,
    ]),
    el("div", { class: "hero-amount" }, [
      el("span", { class: "hero-yen" }, ["¥"]),
      el("span", { class: "hero-int" }, [parts.int]),
      el("span", { class: "hero-dec" }, [`.${parts.dec}`]),
    ]),
    el("div", { class: "hero-metrics" }, [
      el("div", { class: "hero-metric" }, [
        el("div", { class: "hero-metric-label" }, ["笔数"]),
        el("div", { class: "hero-metric-value" }, [`${monthList.length} 笔`]),
      ]),
      el("div", { class: "hero-metric" }, [
        el("div", { class: "hero-metric-label" }, ["日均"]),
        el("div", { class: "hero-metric-value" }, [formatYuan(avg)]),
      ]),
    ]),
  ]);
  if (categories.length) {
    const chips = el("div", { class: "hero-chips" });
    for (const row of categories.slice(0, 3)) {
      chips.append(
        el("span", { class: "hero-chip" }, [
          `${row.category} ${formatPercent(row.share)}`,
        ]),
      );
    }
    hero.append(chips);
  }
  if (note) hero.append(el("p", { class: "hero-note" }, [note]));
  const page = el("div", { class: "page" }, [
    el("div", { class: "masthead" }, [nav, period, hero]),
  ]);
  if (state.banner && (state.banner.kind === "error" || state.banner.kind === "success")) {
    page.append(
      el("p", { class: `toast toast-${state.banner.kind}` }, [state.banner.text]),
    );
  }

  page.append(renderCategories(categories));

  const list = el("section", { class: "list" });
  const listHead = el("div", { class: "list-head" }, [
    el("h2", { class: "list-title" }, [
      state.category ? `${state.category}` : "流水",
    ]),
  ]);
  list.append(listHead);

  if (!visible.length) {
    list.append(el("p", { class: "empty" }, ["没有符合条件的记录"]));
  } else {
    for (const group of groups) {
      list.append(
        el("div", { class: "day-head" }, [
          el("span", {}, [formatDayHeading(group.date, showYear)]),
          el("span", {}, [`支出 ${formatYuan(group.total)}`]),
        ]),
      );
      const dayCard = el("div", { class: "day-card" });
      for (const item of group.items) {
        const icon = el("span", { class: "row-icon" }, [item.category.slice(0, 1)]);
        tinted(icon, item.category);
        const title = (item.note.trim() || item.category).replace(/\s+/g, " ");
        const row = el("button", { class: "row", type: "button" });
        row.append(
          icon,
          el("div", { class: "row-body" }, [
            el("div", { class: "row-title" }, [title]),
            el("div", { class: "row-sub" }, [item.payMethod || item.category]),
          ]),
          el("div", { class: "row-amount" }, [`-${formatNumber(item.amount)}`]),
        );
        row.addEventListener("click", () => openMemo(item));
        dayCard.append(row);
      }
      list.append(dayCard);
    }
  }
  page.append(list, renderTabs());
  root.replaceChildren(page, fileInput);
}

function paint(): void {
  if (state.openItem) {
    root.replaceChildren(renderMemo(state.openItem), fileInput);
    return;
  }
  if (state.view === "stats") {
    renderStats();
    return;
  }
  render();
}

export async function start(): Promise<void> {
  const loaded = await loadLedger();
  state.expenses = loaded.expenses;
  state.source = loaded.source;
  state.month = defaultMonthKey(loaded.expenses);
  state.banner = null;
  paint();
}
