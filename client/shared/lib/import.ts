import { apiPost } from "./api";

/**
 * One row of the flat import schema (see server/lib/import.ts) — the same
 * shape whether it came from an uploaded JSON array or a parsed CSV row.
 * "label" plays category (expense/revenue/draw) or source
 * (investment/debt/repayment) depending on "kind", so founders — or an LLM
 * reshaping their data for them — only learn one shape, not four.
 */
export interface ImportRow {
  kind: "expense" | "revenue" | "investment" | "draw" | "debt" | "repayment";
  amount: number;
  label: string;
  note: string;
  date: string;
}

export interface ImportRowError {
  row: number;
  reason: string;
}

export interface ImportResult {
  imported: number;
  skipped: ImportRowError[];
}

export async function importEntries(businessId: string, rows: unknown[]): Promise<ImportResult> {
  return apiPost<ImportResult>(`/import?businessId=${businessId}`, { rows });
}
