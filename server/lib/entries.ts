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

/** A UnifiedEntry currently in the trash: same shape, plus when it was deleted. */
export interface TrashedEntry extends UnifiedEntry {
  deletedAt: string;
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

export interface TrashResult {
  items: TrashedEntry[];
  total: number;
}

/** Case-insensitive substring match across the given fields. User input is escaped so it can never be read as regex syntax. */
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

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parseIntParam(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Shared query-string parsing for both /api/entries and /api/trash: they
 * accept identical filter params, so this lives once here rather than
 * being duplicated per route.
 */
export function parseEntriesQuery(query: Record<string, unknown>): EntriesQuery {
  const page = parseIntParam(query.page, 1);
  const pageSize = Math.min(parseIntParam(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const kindsRaw = typeof query.kinds === "string" && query.kinds ? query.kinds.split(",").map((k) => k.trim()) : [];
  const kinds = ALL_KINDS.filter((k) => kindsRaw.includes(k));
  const dateFrom = parseDate(query.dateFrom);
  const dateTo = parseDate(query.dateTo);
  return { page, pageSize, search, kinds, dateFrom, dateTo };
}

interface LeanExpense { _id: unknown; type: "expense" | "income"; amount: number; category: string; note?: string; date: Date; deletedAt?: Date | null }
interface LeanInvestment { _id: unknown; amount: number; source?: string; note?: string; date: Date; deletedAt?: Date | null }
interface LeanDraw { _id: unknown; amount: number; category: string; note?: string; date: Date; deletedAt?: Date | null }
interface LeanDebt { _id: unknown; type: "borrow" | "repay"; amount: number; source?: string; note?: string; date: Date; deletedAt?: Date | null }

interface RawDocs {
  txns: LeanExpense[];
  invs: LeanInvestment[];
  draws: LeanDraw[];
  debts: LeanDebt[];
}

/**
 * Shared query logic for both the active entries list and the trash view:
 * identical filtering (search/kinds/date range), differing only in which
 * side of `deletedAt` they read. Filters are pushed into each collection's
 * own Mongo query (including skipping a collection's query entirely when
 * `kinds` excludes everything it could contain) rather than fetched-then-
 * filtered in memory, so only genuinely matching documents ever cross the
 * wire from Mongo.
 */
async function fetchRawDocs(
  userId: string,
  businessId: string,
  query: EntriesQuery,
  deletedAtFilter: null | { $ne: null }
): Promise<RawDocs> {
  const base = { userId, businessId, deletedAt: deletedAtFilter, ...dateRangeFilter(query.dateFrom, query.dateTo) };
  const wantsAll = query.kinds.length === 0;
  const wants = (kind: UnifiedEntry["kind"]): boolean => wantsAll || query.kinds.includes(kind);

  const [txns, invs, draws, debts] = await Promise.all([
    wants("expense") || wants("revenue")
      ? ExpenseModel.find({
          ...base,
          type: { $in: [wants("expense") && "expense", wants("revenue") && "income"].filter(Boolean) },
          ...searchFilter(query.search, ["category", "note"]),
        }).lean<LeanExpense[]>()
      : Promise.resolve([]),
    wants("investment")
      ? InvestmentModel.find({ ...base, ...searchFilter(query.search, ["source", "note"]) }).lean<LeanInvestment[]>()
      : Promise.resolve([]),
    wants("draw")
      ? DrawModel.find({ ...base, ...searchFilter(query.search, ["category", "note"]) }).lean<LeanDraw[]>()
      : Promise.resolve([]),
    wants("debt") || wants("repayment")
      ? DebtModel.find({
          ...base,
          type: { $in: [wants("debt") && "borrow", wants("repayment") && "repay"].filter(Boolean) },
          ...searchFilter(query.search, ["source", "note"]),
        }).lean<LeanDebt[]>()
      : Promise.resolve([]),
  ]);

  return { txns, invs, draws, debts };
}

function toUnified(docs: RawDocs): UnifiedEntry[] {
  const unified: UnifiedEntry[] = [];

  for (const t of docs.txns) {
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
  for (const inv of docs.invs) {
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
  for (const d of docs.draws) {
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
  for (const d of docs.debts) {
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

  return unified;
}

/**
 * Fetches, filters, merges, sorts, and paginates a founder's active
 * entries across all 4 ledger collections. Merging, sorting, and paging
 * happen in memory after the (already filtered, so bounded) fetch. It's the
 * right tradeoff at solo-founder scale (hundreds to low thousands of
 * small documents) versus migrating every entry kind into one collection
 * just to get DB-level `.skip().limit()`.
 */
export async function fetchUnifiedEntries(userId: string, businessId: string, query: EntriesQuery): Promise<EntriesResult> {
  const docs = await fetchRawDocs(userId, businessId, query, null);
  const unified = toUnified(docs);
  unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = unified.length;
  const start = (query.page - 1) * query.pageSize;
  const items = unified.slice(start, start + query.pageSize);
  return { items, total };
}

/**
 * The trash view: everything soft-deleted, with the exact same
 * search/kind/date-range/pagination support as the active list, so the
 * two feel like one consistent UI rather than a stripped-down afterthought.
 */
export async function fetchTrashedEntries(userId: string, businessId: string, query: EntriesQuery): Promise<TrashResult> {
  const docs = await fetchRawDocs(userId, businessId, query, { $ne: null });
  const unified = toUnified(docs);

  // Re-attach deletedAt per source since toUnified() doesn't carry it.
  const deletedAtById = new Map<string, Date>();
  for (const t of docs.txns) if (t.deletedAt) deletedAtById.set(String(t._id), t.deletedAt);
  for (const inv of docs.invs) if (inv.deletedAt) deletedAtById.set(String(inv._id), inv.deletedAt);
  for (const d of docs.draws) if (d.deletedAt) deletedAtById.set(String(d._id), d.deletedAt);
  for (const d of docs.debts) if (d.deletedAt) deletedAtById.set(String(d._id), d.deletedAt);

  const trashed: TrashedEntry[] = unified.map((e) => ({
    ...e,
    deletedAt: (deletedAtById.get(e.id) ?? new Date()).toISOString(),
  }));

  trashed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = trashed.length;
  const start = (query.page - 1) * query.pageSize;
  const items = trashed.slice(start, start + query.pageSize);
  return { items, total };
}
