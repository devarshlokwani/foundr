import { Router, type Request, type Response } from "express";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { computeInsights, type InsightEntry, type InvestmentEntry } from "../lib/insights.js";

/**
 * Insights API — data for the dashboard charts, for one business.
 * Returns the spending-by-category breakdown and the monthly cash series.
 *
 * Routes:
 *   GET /api/insights?businessId=
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;

  const [entries, investments] = await Promise.all([
    ExpenseModel.find({ userId, businessId }).select("type amount category date").lean(),
    InvestmentModel.find({ userId, businessId }).select("amount date").lean(),
  ]);

  const insights = computeInsights(
    entries as unknown as InsightEntry[],
    investments as unknown as InvestmentEntry[]
  );
  res.json(insights);
});

export default router;