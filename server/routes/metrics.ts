import { Router, type Request, type Response } from "express";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { computeMetrics, type Entry } from "../lib/metrics.js";

/**
 * Metrics API — the calculated numbers that make Foundr useful.
 * Pulls the founder's transactions and investments, runs them through
 * the pure functions in lib/metrics, and returns burn, runway, ROI,
 * margins, and totals in one call for the dashboard.
 *
 * Routes:
 *   GET /api/metrics  the founder's full metric summary
 */
const router = Router();

router.use(requireUser);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);

  const [entries, investments] = await Promise.all([
    ExpenseModel.find({ userId }).select("type amount date").lean(),
    InvestmentModel.find({ userId }).select("amount").lean(),
  ]);

  const totalInvested = investments.reduce((sum, inv) => sum + (inv.amount ?? 0), 0);

  const metrics = computeMetrics(entries as unknown as Entry[], totalInvested);
  res.json(metrics);
});

export default router;