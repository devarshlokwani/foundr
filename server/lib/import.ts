import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { DrawModel } from "../models/Draw.js";
import { DebtModel } from "../models/Debt.js";

/**
 * Bulk data import — lets a founder migrate existing records into Foundr
 * instead of re-typing years of history one entry at a time. The accepted
 * shape is deliberately flat and uniform across all 5 entry kinds (see
 * ImportRow below) — "label" plays the role of `category` for
 * expense/revenue/draw and `source` for investment/debt/repayment, so
 * founders (or an LLM reshaping their data for them) only ever need to
 * learn one shape, not four.
 */

export type ImportKind = "expense" | "revenue" | "investment" | "draw" | "debt" | "repayment";

const VALID_KINDS: ImportKind[] = ["expense", "revenue", "investment", "draw", "debt", "repayment"];

export interface ValidatedImportRow {
  kind: ImportKind;
  amount: number;
  label: string;
  note: string;
  date: Date;
}

export interface ImportRowError {
  row: number;
  reason: string;
}

export interface ImportValidationResult {
  valid: ValidatedImportRow[];
  errors: ImportRowError[];
}

/** Caps a single import request so it can't be used to hammer the DB with an unbounded insert. */
export const MAX_IMPORT_ROWS = 2000;

/**
 * Validates a raw parsed array (from uploaded JSON or CSV) against the
 * import schema. Every row is checked independently — one bad row never
 * blocks the rest, it's just reported back so the founder can fix and
 * retry only what failed.
 */
export function validateImportRows(raw: unknown): ImportValidationResult {
  if (!Array.isArray(raw)) {
    return { valid: [], errors: [{ row: 0, reason: "Expected a list of entries, got something else." }] };
  }

  const valid: ValidatedImportRow[] = [];
  const errors: ImportRowError[] = [];

  raw.forEach((item, i) => {
    const row = i + 1;
    if (!item || typeof item !== "object") {
      errors.push({ row, reason: "Not a valid entry object." });
      return;
    }
    const r = item as Record<string, unknown>;

    if (typeof r.kind !== "string" || !VALID_KINDS.includes(r.kind as ImportKind)) {
      errors.push({ row, reason: `"kind" must be one of ${VALID_KINDS.join(", ")}.` });
      return;
    }

    const amount = typeof r.amount === "number" ? r.amount : typeof r.amount === "string" ? parseFloat(r.amount) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push({ row, reason: '"amount" must be a positive number.' });
      return;
    }

    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!label) {
      errors.push({ row, reason: '"label" is required.' });
      return;
    }

    const dateStr = typeof r.date === "string" ? r.date : "";
    const date = dateStr ? new Date(dateStr) : null;
    if (!date || isNaN(date.getTime())) {
      errors.push({ row, reason: '"date" must be a valid date (e.g. 2026-01-15).' });
      return;
    }

    const note = typeof r.note === "string" ? r.note.trim() : "";

    valid.push({ kind: r.kind as ImportKind, amount, label, note, date });
  });

  return { valid, errors };
}

/** Persists already-validated rows, grouped into the right collection per kind. */
export async function importRows(userId: string, businessId: string, rows: ValidatedImportRow[]): Promise<void> {
  const expenseDocs = rows
    .filter((r) => r.kind === "expense" || r.kind === "revenue")
    .map((r) => ({
      userId, businessId, type: r.kind === "revenue" ? "income" : "expense",
      amount: r.amount, category: r.label, note: r.note, date: r.date,
    }));
  const drawDocs = rows
    .filter((r) => r.kind === "draw")
    .map((r) => ({ userId, businessId, amount: r.amount, category: r.label, note: r.note, date: r.date }));
  const investmentDocs = rows
    .filter((r) => r.kind === "investment")
    .map((r) => ({ userId, businessId, amount: r.amount, source: r.label, note: r.note, date: r.date }));
  const debtDocs = rows
    .filter((r) => r.kind === "debt" || r.kind === "repayment")
    .map((r) => ({
      userId, businessId, type: r.kind === "debt" ? "borrow" : "repay",
      amount: r.amount, source: r.label, note: r.note, date: r.date,
    }));

  await Promise.all([
    expenseDocs.length ? ExpenseModel.insertMany(expenseDocs) : null,
    drawDocs.length ? DrawModel.insertMany(drawDocs) : null,
    investmentDocs.length ? InvestmentModel.insertMany(investmentDocs) : null,
    debtDocs.length ? DebtModel.insertMany(debtDocs) : null,
  ]);
}
