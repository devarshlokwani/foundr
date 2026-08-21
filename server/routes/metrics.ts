import { Router, type Request, type Response } from "express";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { DrawModel } from "../models/Draw.js";
import { DebtModel } from "../models/Debt.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { computeMetrics, type Entry } from "../lib/metrics.js";
import { parseRangeQuery } from "../lib/dateRange.js";
import { materializeDueRules } from "../lib/recurring.js";

/**
 * Metrics API — the calculated numbers that make Foundr useful.
 * Pulls one business's transactions and investments, runs them through
 * the pure functions in lib/metrics, and returns burn, runway, ROI,
 * margins, and totals in one call for the dashboard.
 *
 * Routes:
 *   GET /api/metrics?businessId=&rangeStart=&rangeEnd=  that business's
 *     metric summary — all-time if no range is given (see lib/dateRange.ts)
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const { period, dateFilter } = parseRangeQuery(req.query as Record<string, unknown>);

  await materializeDueRules(userId!, businessId!);

  const [entries, investments, draws, debts] = await Promise.all([
    ExpenseModel.find({ userId, businessId, ...dateFilter }).select("type amount date").lean(),
    InvestmentModel.find({ userId, businessId, ...dateFilter }).select("amount").lean(),
    DrawModel.find({ userId, businessId, ...dateFilter }).select("amount").lean(),
    DebtModel.find({ userId, businessId, ...dateFilter }).select("type amount").lean(),
  ]);

  const totalInvested = investments.reduce((sum, inv) => sum + (inv.amount ?? 0), 0);
  const totalDraws = draws.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const netBorrowed = debts.reduce(
    (sum, d) => sum + (d.type === "borrow" ? d.amount : -d.amount),
    0
  );

  const metrics = computeMetrics(entries as unknown as Entry[], totalInvested, totalDraws, netBorrowed, period);
  res.json(metrics);
});

export default router;