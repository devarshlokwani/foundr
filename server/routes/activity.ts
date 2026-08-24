import { Router, type Request, type Response } from "express";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { ActivityLogModel } from "../models/ActivityLog.js";

/**
 * Activity API — a paginated, newest-first record of who changed what and
 * when for one business. Written by lib/activityLog.ts, called from every
 * mutating route across the ledger and config collections.
 *
 * Unlike /api/entries, this is a single collection, so pagination is real
 * DB-level `.skip().limit()` rather than the merge-then-paginate approach
 * entries needs across 4 collections.
 *
 * Routes:
 *   GET /api/activity?businessId=&page=&pageSize=
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

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;
  const page = parseIntParam(req.query.page, 1);
  const pageSize = Math.min(parseIntParam(req.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  const [items, total] = await Promise.all([
    ActivityLogModel.find({ userId, businessId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    ActivityLogModel.countDocuments({ userId, businessId }),
  ]);

  res.json({ items, total, page, pageSize });
});

export default router;
