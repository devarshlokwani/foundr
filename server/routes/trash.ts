import { Router, type Request, type Response } from "express";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { fetchTrashedEntries, parseEntriesQuery } from "../lib/entries.js";

/**
 * Trash: everything soft-deleted across the 4 ledger collections for one
 * business, with the exact same search/kind/date-range/pagination support
 * as /api/entries (same parseEntriesQuery), so the Deleted view in the
 * frontend can be a true one-to-one clone of the Active view rather than a
 * stripped-down afterthought.
 *
 * Restoring or permanently deleting an item goes through that item's own
 * collection route (e.g. POST /api/transactions/:id/restore), the same
 * way edit/delete already route by `source` in the frontend. This route
 * only lists.
 *
 * Routes:
 *   GET /api/trash?businessId=&page=&pageSize=&search=&kinds=&dateFrom=&dateTo=
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId!;

  const parsed = parseEntriesQuery(req.query as Record<string, unknown>);
  const { items, total } = await fetchTrashedEntries(userId, businessId, parsed);

  res.json({ items, total, page: parsed.page, pageSize: parsed.pageSize });
});

export default router;
