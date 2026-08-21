import { Router, type Request, type Response } from "express";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { computeInsights, type InsightEntry, type InvestmentEntry } from "../lib/insights.js";
import { parseRangeQuery } from "../lib/dateRange.js";

/**
 * Insights API — data for the dashboard and margins-trends charts, for
 * one business. Returns the spending-by-category breakdown, the running
 * monthly cash series, and the per-month income/expense series.
 *
 * Routes:
 *   GET /api/insights?businessId=&rangeStart=&rangeEnd=  category
 *     breakdown and the monthly series are scoped to the range if given;
 *     the running cash series always stays all-time (see lib/insights.ts)
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;
  const { period } = parseRangeQuery(req.query as Record<string, unknown>);

  const [entries, investments] = await Promise.all([
    ExpenseModel.find({ userId, businessId }).select("type amount category date").lean(),
    InvestmentModel.find({ userId, businessId }).select("amount date").lean(),
  ]);

  const insights = computeInsights(
    entries as unknown as InsightEntry[],
    investments as unknown as InvestmentEntry[],
    period
  );
  res.json(insights);
});

export default router;