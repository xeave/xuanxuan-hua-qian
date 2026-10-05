import Papa from "papaparse";
import type { Expense, ParseError, ParseResult } from "./types";

const DATE_ALIASES = new Set([
  "date",
  "日期",
  "时间",
  "消费日期",
  "支出日期",
  "发生日期",
]);
const AMOUNT_ALIASES = new Set([
  "amount",
  "金额",
  "花销",
  "支出",
  "费用",
  "价钱",
  "价格",
]);
const CATEGORY_ALIASES = new Set([
  "category",
  "分类",
  "类别",
  "类型",
  "科目",
  "账目明细",
  "项目",
  "明细",
]);
const NOTE_ALIASES = new Set(["note", "备注", "说明", "内容", "摘要", "事项"]);
const PAY_ALIASES = new Set([
  "paymethod",
  "pay_method",
  "payment",
  "支付方式",
  "付款方式",
  "支付",
  "付款",
]);

function normalizeHeader(raw: string): string {
  return raw.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_]/g, "");
}

function headerKey(header: string): string | null {
  const n = normalizeHeader(header);
  if (DATE_ALIASES.has(n) || DATE_ALIASES.has(header.trim())) return "date";
  if (AMOUNT_ALIASES.has(n) || AMOUNT_ALIASES.has(header.trim())) return "amount";
  if (CATEGORY_ALIASES.has(n) || CATEGORY_ALIASES.has(header.trim())) {
    return "category";
  }
  if (NOTE_ALIASES.has(n) || NOTE_ALIASES.has(header.trim())) return "note";
  if (PAY_ALIASES.has(n) || PAY_ALIASES.has(header.trim())) return "payMethod";
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseDate(raw: string): string | null {
  const s = raw.replace(/^\uFEFF/, "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (m) {
    return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = Number(m[3]);
    if (a > 12) return toIsoDate(year, b, a);
    return toIsoDate(year, a, b);
  }

  return null;
}

export function parseAmount(raw: string): number | null {
  const s = raw
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/[¥￥$,，\s]/g, "")
    .replace(/[（(]/g, "-")
    .replace(/[）)]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.abs(n);
}

function cell(row: Record<string, string>, key: string): string {
  return (row[key] ?? "").trim();
}

export function decodeCsvBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function parseCsv(text: string, retried = false): ParseResult {
  const errors: ParseError[] = [];
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return {
      expenses: [],
      errors: [{ row: 0, message: "文件是空的" }],
      skipped: 0,
      totalRows: 0,
    };
  }

  const parsed = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter: "",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });

  if (parsed.errors.length && !parsed.data.length) {
    return {
      expenses: [],
      errors: [
        {
          row: 0,
          message: parsed.errors[0]?.message || "CSV 无法解析",
        },
      ],
      skipped: 0,
      totalRows: 0,
    };
  }

  const originalHeaders = parsed.meta.fields ?? [];
  const mapped: Record<string, string> = {};
  for (const h of originalHeaders) {
    const key = headerKey(h);
    if (key && !mapped[key]) mapped[key] = h;
  }

  const missing: string[] = [];
  if (!mapped.date) missing.push("日期（date）");
  if (!mapped.amount) missing.push("金额（amount）");
  if (!mapped.category) missing.push("分类（category）");
  if (missing.length) {
    if (!retried) {
      const lines = trimmed.split(/\r?\n/);
      if (lines.length > 2) return parseCsv(lines.slice(1).join("\n"), true);
    }
    return {
      expenses: [],
      errors: [
        {
          row: 1,
          message: `缺少必填列：${missing.join("、")}。当前表头：${originalHeaders.join(" / ") || "无"}`,
        },
      ],
      skipped: 0,
      totalRows: 0,
    };
  }

  const expenses: Expense[] = [];
  let skipped = 0;
  const rows = parsed.data;
  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const dateRaw = cell(raw, mapped.date);
    const amountRaw = cell(raw, mapped.amount);
    const categoryRaw = cell(raw, mapped.category);
    const noteRaw = mapped.note ? cell(raw, mapped.note) : "";
    const payRaw = mapped.payMethod ? cell(raw, mapped.payMethod) : "";

    if (!dateRaw && !amountRaw && !categoryRaw) {
      return;
    }

    const date = parseDate(dateRaw);
    if (!date) {
      skipped += 1;
      errors.push({
        row: rowNumber,
        message: `日期无法识别：${dateRaw || "空"}`,
      });
      return;
    }

    const amount = parseAmount(amountRaw);
    if (amount === null) {
      skipped += 1;
      errors.push({
        row: rowNumber,
        message: `金额无法识别：${amountRaw || "空"}`,
      });
      return;
    }

    if (!categoryRaw) {
      skipped += 1;
      errors.push({ row: rowNumber, message: "分类为空" });
      return;
    }

    expenses.push({
      date,
      amount,
      category: categoryRaw,
      note: noteRaw,
      payMethod: payRaw,
      book: "",
    });
  });

  expenses.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (!expenses.length) {
    errors.unshift({
      row: 0,
      message: "没有解析到任何花销。请确认日期、金额、分类三列有内容。",
    });
  }

  return {
    expenses,
    errors: errors.slice(0, 8),
    skipped,
    totalRows: rows.length,
  };
}

export function formatParseSummary(result: ParseResult): string {
  const parts = [`已导入 ${result.expenses.length} 笔`];
  if (result.skipped) parts.push(`跳过 ${result.skipped} 行`);
  if (result.errors.length) {
    const detail = result.errors
      .filter((e) => e.row > 0)
      .slice(0, 3)
      .map((e) => `第 ${e.row} 行${e.message}`)
      .join("；");
    if (detail) parts.push(detail);
  }
  return parts.join("。");
}
