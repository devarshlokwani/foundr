import { Router, type Request, type Response } from "express";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { materializeDueRules } from "../lib/recurring.js";
import { fetchUnifiedEntries, ALL_KINDS, type UnifiedEntry } from "../lib/entries.js";

/**
 * Entries API — a unified, read-only, searchable/filterable/paginated
 * timeline of everything the founder has recorded for one business:
 * expenses, revenue, investments, draws, and debt, merged and sorted by
 * date (newest first). See lib/entries.ts for the merge/filter/paginate
 * logic; this route only parses and validates query params.
 *
 * Each item is normalised to a common shape so the frontend can render one
 * list. `source` carries the collection it came from, plus the original
 * id, so edit/delete can route to the right endpoint.
 *
 * Routes:
 *   GET /api/entries?businessId=&page=&pageSize=&search=&kinds=&dateFrom=&dateTo=
 *     page (default 1), pageSize (default 50, capped at 200), search
 *     (case-insensitive substring on category/source + note), kinds
 *     (comma-separated UnifiedEntry["kind"] values; omitted/empty = all),
 *     dateFrom/dateTo (ISO dates, inclusive).
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parseIntParam(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseKinds(value: unknown): UnifiedEntry["kind"][] {
  if (typeof value !== "string" || !value) return [];
  const requested = value.split(",").map((k) => k.trim());
  return ALL_KINDS.filter((k) => requested.includes(k));
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId!;

  await materializeDueRules(userId, businessId);

  const page = parseIntParam(req.query.page, 1);
  const pageSize = Math.min(parseIntParam(req.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const kinds = parseKinds(req.query.kinds);
  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const { items, total } = await fetchUnifiedEntries(userId, businessId, {
    page,
    pageSize,
    search,
    kinds,
    dateFrom,
    dateTo,
  });

  res.json({ items, total, page, pageSize });
});

export default router;
