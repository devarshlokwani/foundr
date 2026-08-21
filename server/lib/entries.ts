import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { DrawModel } from "../models/Draw.js";
import { DebtModel } from "../models/Debt.js";

/**
 * The unified, read-only timeline of everything a founder has recorded for
 * one business: expenses, revenue, investments, draws, and debt, merged
 * into one shape and sorted by date (newest first). Powers "All entries".
 */
export interface UnifiedEntry {
  id: string;
  source: "transaction" | "investment" | "draw" | "debt";
  kind: "expense" | "revenue" | "investment" | "draw" | "debt" | "repayment";
  amount: number;
  label: string;
  note: string;
  date: string;
}

export const ALL_KINDS: UnifiedEntry["kind"][] = ["expense", "revenue", "investment", "draw", "debt", "repayment"];

export interface EntriesQuery {
  page: number;
  pageSize: number;
  search: string;
  /** Empty means every kind. */
  kinds: UnifiedEntry["kind"][];
  dateFrom: Date | null;
  dateTo: Date | null;
}

export interface EntriesResult {
  items: UnifiedEntry[];
  total: number;
}

/** Case-insensitive substring match across the given fields — user input is escaped so it can never be read as regex syntax. */
function searchFilter(search: string, fields: string[]): Record<string, unknown> {
  if (!search) return {};
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");
  return { $or: fields.map((field) => ({ [field]: regex })) };
}

function dateRangeFilter(dateFrom: Date | null, dateTo: Date | null): Record<string, unknown> {
  if (!dateFrom && !dateTo) return {};
  const range: Record<string, Date> = {};
  if (dateFrom) range.$gte = dateFrom;
  if (dateTo) range.$lte = dateTo;
  return { date: range };
}

/**
 * Fetches, filters, merges, sorts, and paginates a founder's entries
 * across all 4 ledger collections. Filters are pushed into each
 * collection's own Mongo query (including skipping a collection's query
 * entirely when `kinds` excludes everything it could contain) rather than
 * fetched-then-filtered in memory, so only genuinely matching documents
 * ever cross the wire from Mongo. Merging, sorting, and paging still
 * happen in memory afterward — the right tradeoff at solo-founder scale
 * (hundreds to low thousands of small documents) versus migrating every
 * entry kind into one collection just to get DB-level `.skip().limit()`.
 */
export async function fetchUnifiedEntries(
  userId: string,
  businessId: string,
  query: EntriesQuery
): Promise<EntriesResult> {
  const { page, pageSize, search, kinds, dateFrom, dateTo } = query;
  const base = { userId, businessId, ...dateRangeFilter(dateFrom, dateTo) };
  const wantsAll = kinds.length === 0;
  const wants = (kind: UnifiedEntry["kind"]): boolean => wantsAll || kinds.includes(kind);

  const unified: UnifiedEntry[] = [];

  if (wants("expense") || wants("revenue")) {
    const types: ("expense" | "income")[] = [];
    if (wants("expense")) types.push("expense");
    if (wants("revenue")) types.push("income");
    const txns = await ExpenseModel.find({
      ...base,
      type: { $in: types },
      ...searchFilter(search, ["category", "note"]),
    }).lean();
    for (const t of txns) {
      unified.push({
        id: String(t._id),
        source: "transaction",
        kind: t.type === "income" ? "revenue" : "expense",
        amount: t.amount,
        label: t.category,
        note: t.note ?? "",
        date: new Date(t.date).toISOString(),
      });
    }
  }

  if (wants("investment")) {
    const invs = await InvestmentModel.find({ ...base, ...searchFilter(search, ["source", "note"]) }).lean();
    for (const inv of invs) {
      unified.push({
        id: String(inv._id),
        source: "investment",
        kind: "investment",
        amount: inv.amount,
        label: inv.source ?? "Personal savings",
        note: inv.note ?? "",
        date: new Date(inv.date).toISOString(),
      });
    }
  }

  if (wants("draw")) {
    const draws = await DrawModel.find({ ...base, ...searchFilter(search, ["category", "note"]) }).lean();
    for (const d of draws) {
      unified.push({
        id: String(d._id),
        source: "draw",
        kind: "draw",
        amount: d.amount,
        label: d.category,
        note: d.note ?? "",
        date: new Date(d.date).toISOString(),
      });
    }
  }

  if (wants("debt") || wants("repayment")) {
    const types: ("borrow" | "repay")[] = [];
    if (wants("debt")) types.push("borrow");
    if (wants("repayment")) types.push("repay");
    const debts = await DebtModel.find({
      ...base,
      type: { $in: types },
      ...searchFilter(search, ["source", "note"]),
    }).lean();
    for (const d of debts) {
      unified.push({
        id: String(d._id),
        source: "debt",
        kind: d.type === "borrow" ? "debt" : "repayment",
        amount: d.amount,
        label: d.source ?? "Bank loan",
        note: d.note ?? "",
        date: new Date(d.date).toISOString(),
      });
    }
  }

  unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = unified.length;
  const start = (page - 1) * pageSize;
  const items = unified.slice(start, start + pageSize);

  return { items, total };
}
