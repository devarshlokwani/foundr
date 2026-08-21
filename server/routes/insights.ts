import { Router, type Request, type Response } from "express";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { computeInsights, type InsightEntry, type InvestmentEntry, type Granularity } from "../lib/insights.js";
import { parseRangeQuery } from "../lib/dateRange.js";

const GRANULARITIES: Granularity[] = ["day", "biweekly", "month"];

function parseGranularity(value: unknown): Granularity {
  return typeof value === "string" && (GRANULARITIES as string[]).includes(value) ? (value as Granularity) : "month";
}

/**
 * Insights API — data for the dashboard and margins-trends charts, for
 * one business. Returns the spending-by-category breakdown, the running
 * cash series, and the per-bucket income/expense series.
 *
 * Routes:
 *   GET /api/insights?businessId=&rangeStart=&rangeEnd=&granularity=  category
 *     breakdown and the second series are scoped to the range if given;
 *     the running cash series always stays all-time (see lib/insights.ts).
 *     granularity is "day" | "biweekly" | "month" (default "month") and
 *     applies to both series.
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;
  const { period } = parseRangeQuery(req.query as Record<string, unknown>);
  const granularity = parseGranularity(req.query.granularity);

  const [entries, investments] = await Promise.all([
    ExpenseModel.find({ userId, businessId }).select("type amount category date").lean(),
    InvestmentModel.find({ userId, businessId }).select("amount date").lean(),
  ]);

  const insights = computeInsights(
    entries as unknown as InsightEntry[],
    investments as unknown as InvestmentEntry[],
    period,
    granularity
  );
  res.json(insights);
});

export default router;