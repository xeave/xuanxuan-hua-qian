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
  formatShortMonth,
  formatYuan,
  navigableMonths,
  splitYuan,
} from "./format";
import { loadLedger } from "./load";
import { formatParseSummary, parseCsv } from "./parse";
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
  type: "file",
  accept: ".csv,text/csv,text/plain",
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (file) void importFile(file);
});

const state: State = {
  expenses: [],
  source: "sample",
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
  if (state.source === "sample") return "当前是示例数据，导入 CSV 后会整表替换。";
  if (state.source === "local-file") {
    return `${formatMonthLabel(months[0])} – ${formatMonthLabel(months[months.length - 1])} · 本地`;
  }
  return null;
}

async function importFile(file: File): Promise<void> {
  const text = await file.text();
  const result = parseCsv(text);
  if (!result.expenses.length) {
    const first = result.errors[0]?.message || "导入失败";
    state.banner = { kind: "error", text: first };
    render();
    return;
  }
  await saveExpenses(result.expenses);
  state.expenses = result.expenses;
  state.source = "indexeddb";
  state.category = null;
  state.month = defaultMonthKey(result.expenses);
  state.banner = { kind: "success", text: formatParseSummary(result) };
  paint();
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

function renderTabs(): HTMLElement {
  const bar = el("nav", { class: "tabbar" });
  const ledger = el(
    "button",
    { class: state.view === "ledger" ? "tab is-on" : "tab", type: "button" },
    ["账单"],
  );
  const stats = el(
    "button",
    { class: state.view === "stats" ? "tab is-on" : "tab", type: "button" },
    ["统计"],
  );
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

function renderMemo(item: Expense): HTMLElement {
  const page = el("div", { class: "memo" });
  const back = el("button", { class: "memo-back", type: "button" }, ["返回"]);
  back.addEventListener("click", closeSheet);
  const meta = [item.category, formatDayHeading(item.date, true)];
  if (item.payMethod) meta.push(item.payMethod);
  page.append(
    el("header", { class: "memo-nav" }, [back]),
    el("div", { class: "memo-hero" }, [
      el("div", { class: "memo-amount" }, [`-${formatYuan(item.amount)}`]),
      el("div", { class: "memo-meta" }, [meta.join(" · ")]),
    ]),
    el("section", { class: "memo-card" }, [
      el("div", { class: "memo-label" }, ["备注"]),
      el("p", { class: "memo-note" }, [item.note.trim() || "没有写备注"]),
    ]),
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
      el("span", { class: "cat-pct" }, [`${Math.round(row.share * 100)}%`]),
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

  const nav = el("header", { class: "nav" }, [
    el("h1", { class: "nav-title" }, ["统计"]),
    el("button", { class: "nav-action", type: "button" }, ["导入"]),
  ]);
  (nav.querySelector(".nav-action") as HTMLButtonElement).addEventListener("click", () => {
    fileInput.click();
  });

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
        `${Math.round(top.share * 100)}% · ${formatYuan(top.amount)}`,
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

  const nav = el("header", { class: "nav" }, [
    el("h1", { class: "nav-title" }, ["账单"]),
    el("button", { class: "nav-action", type: "button" }, ["导入"]),
  ]);
  const importBtn = nav.querySelector(".nav-action") as HTMLButtonElement;
  importBtn.addEventListener("click", () => fileInput.click());

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
    el("div", { class: "hero-kicker" }, [state.month === "all" ? "全部支出" : "本月支出"]),
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
          `${row.category} ${Math.round(row.share * 100)}%`,
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

  if (!state.expenses.length) {
    page.append(
      el("section", { class: "card" }, [
        el("p", { class: "empty" }, ["还没有数据，点右上角导入 Numbers 导出的 CSV"]),
      ]),
    );
    page.append(renderTabs());
    root.replaceChildren(page, fileInput);
    return;
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
