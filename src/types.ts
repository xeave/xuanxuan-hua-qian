export type Expense = {
  date: string;
  amount: number;
  category: string;
  note: string;
  payMethod: string;
};

export type DataSource = "local-file" | "indexeddb" | "sample";

export type MonthKey = string | "all";

export type ParseError = {
  row: number;
  message: string;
};

export type ParseResult = {
  expenses: Expense[];
  errors: ParseError[];
  skipped: number;
  totalRows: number;
};

export type Banner = {
  kind: "sample" | "success" | "error" | "info";
  text: string;
};
