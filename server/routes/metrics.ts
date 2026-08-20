import { Router, type Request, type Response } from "express";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { DrawModel } from "../models/Draw.js";
import { DebtModel } from "../models/Debt.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { computeMetrics, type Entry } from "../lib/metrics.js";

/**
 * Metrics API — the calculated numbers that make Foundr useful.
 * Pulls one business's transactions and investments, runs them through
 * the pure functions in lib/metrics, and returns burn, runway, ROI,
 * margins, and totals in one call for the dashboard.
 *
 * Routes:
 *   GET /api/metrics?businessId=  that business's full metric summary
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;

  const [entries, investments, draws, debts] = await Promise.all([
    ExpenseModel.find({ userId, businessId }).select("type amount date").lean(),
    InvestmentModel.find({ userId, businessId }).select("amount").lean(),
    DrawModel.find({ userId, businessId }).select("amount").lean(),
    DebtModel.find({ userId, businessId }).select("type amount").lean(),
  ]);

  const totalInvested = investments.reduce((sum, inv) => sum + (inv.amount ?? 0), 0);
  const totalDraws = draws.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const netBorrowed = debts.reduce(
    (sum, d) => sum + (d.type === "borrow" ? d.amount : -d.amount),
    0
  );

  const metrics = computeMetrics(entries as unknown as Entry[], totalInvested, totalDraws, netBorrowed);
  res.json(metrics);
});

export default router;