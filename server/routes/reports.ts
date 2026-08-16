import { Router, type Request, type Response } from "express";
import { requireUser, getUserId } from "../middleware/auth.js";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { computeMetrics } from "../lib/metrics.js";
import { computeCategoryBreakdown, computeRevenueBreakdown } from "../lib/insights.js";

/**
 * Business summary / margins report.
 *
 * Not a formal balance sheet (Foundr doesn't track assets or liabilities,
 * only cash flow and the founder's own investment) — this is a cash-basis
 * income breakdown: revenue by category, expenses by category, and the net
 * margin that's left over. The frontend exports it as CSV.
 *
 * Routes:
 *   GET /api/reports/margins
 */
const router = Router();

router.use(requireUser);

router.get("/margins", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;

  const entries = await ExpenseModel.find({ userId }).select("type amount category date");
  const investments = await InvestmentModel.find({ userId }).select("amount date");
  const totalInvested = investments.reduce((sum, i) => sum + i.amount, 0);

  res.json({
    revenue: computeRevenueBreakdown(entries),
    expenses: computeCategoryBreakdown(entries),
    metrics: computeMetrics(entries, totalInvested),
  });
});

export default router;
