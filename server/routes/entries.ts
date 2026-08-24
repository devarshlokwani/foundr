import { Router, type Request, type Response } from "express";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { materializeDueRules } from "../lib/recurring.js";
import { fetchUnifiedEntries, parseEntriesQuery } from "../lib/entries.js";

/**
 * Entries API — a unified, read-only, searchable/filterable/paginated
 * timeline of everything the founder has recorded for one business:
 * expenses, revenue, investments, draws, and debt, merged and sorted by
 * date (newest first). See lib/entries.ts for the merge/filter/paginate
 * logic; this route only parses query params (parseEntriesQuery, shared
 * with /api/trash since the two accept identical filters).
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

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId!;

  await materializeDueRules(userId, businessId);

  const parsed = parseEntriesQuery(req.query as Record<string, unknown>);
  const { items, total } = await fetchUnifiedEntries(userId, businessId, parsed);

  res.json({ items, total, page: parsed.page, pageSize: parsed.pageSize });
});

export default router;
