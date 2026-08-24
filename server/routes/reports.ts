import { Router, type Request, type Response } from "express";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { DrawModel } from "../models/Draw.js";
import { DebtModel } from "../models/Debt.js";
import { computeMetrics } from "../lib/metrics.js";
import { computeCategoryBreakdown, computeRevenueBreakdown } from "../lib/insights.js";
import { computeBalanceSheet } from "../lib/balanceSheet.js";
import { parseRangeQuery } from "../lib/dateRange.js";

/**
 * Business reports — margins (a cash-basis income breakdown: revenue by
 * category, expenses by category, net margin) and the balance sheet
 * (Assets = Liabilities + Equity, made possible by Draws and Debt), for
 * one business. Both exported as CSV by the frontend.
 *
 * Routes:
 *   GET /api/reports/margins?businessId=&rangeStart=&rangeEnd=  revenue and
 *     expense breakdowns are scoped to the range if given; balance sheet
 *     never accepts a range — it's always a live, all-time snapshot.
 *   GET /api/reports/balance-sheet?businessId=
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/margins", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;
  const { period, dateFilter } = parseRangeQuery(req.query as Record<string, unknown>);

  const [entries, investments, draws, debts] = await Promise.all([
    ExpenseModel.find({ userId, businessId, deletedAt: null, ...dateFilter }).select("type amount category date"),
    InvestmentModel.find({ userId, businessId, deletedAt: null, ...dateFilter }).select("amount date"),
    DrawModel.find({ userId, businessId, deletedAt: null, ...dateFilter }).select("amount"),
    DebtModel.find({ userId, businessId, deletedAt: null, ...dateFilter }).select("type amount"),
  ]);

  const totalInvested = investments.reduce((sum, i) => sum + i.amount, 0);
  const totalDraws = draws.reduce((sum, d) => sum + d.amount, 0);
  const netBorrowed = debts.reduce((sum, d) => sum + (d.type === "borrow" ? d.amount : -d.amount), 0);

  const periodEntries = period
    ? entries.filter((e) => {
        const d = new Date(e.date);
        return d >= period.start && d <= period.end;
      })
    : entries;

  res.json({
    revenue: computeRevenueBreakdown(periodEntries),
    expenses: computeCategoryBreakdown(periodEntries),
    metrics: computeMetrics(entries, totalInvested, totalDraws, netBorrowed, period),
  });
});

router.get("/balance-sheet", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;

  const [expenses, investments, draws, debts] = await Promise.all([
    ExpenseModel.find({ userId, businessId, deletedAt: null }).select("type amount isCapital"),
    InvestmentModel.find({ userId, businessId, deletedAt: null }).select("amount"),
    DrawModel.find({ userId, businessId, deletedAt: null }).select("amount"),
    DebtModel.find({ userId, businessId, deletedAt: null }).select("type amount"),
  ]);

  let totalIncome = 0;
  let operatingExpenses = 0;
  let fixedAssets = 0;
  for (const e of expenses) {
    if (e.type === "income") {
      totalIncome += e.amount;
    } else if (e.isCapital) {
      fixedAssets += e.amount;
    } else {
      operatingExpenses += e.amount;
    }
  }
  const totalExpenses = operatingExpenses + fixedAssets;

  const totalInvested = investments.reduce((sum, i) => sum + i.amount, 0);
  const totalDraws = draws.reduce((sum, d) => sum + d.amount, 0);
  const netBorrowed = debts.reduce((sum, d) => sum + (d.type === "borrow" ? d.amount : -d.amount), 0);

  // Same cashRemaining formula as computeMetrics in lib/metrics.ts, kept in
  // sync deliberately rather than reused, since gaming computeMetrics with
  // synthetic entries here would be more confusing than one clear line.
  const cashRemaining = totalInvested + totalIncome - totalExpenses - totalDraws + netBorrowed;

  const retainedEarnings = totalIncome - operatingExpenses;

  const balanceSheet = computeBalanceSheet({
    cashRemaining,
    fixedAssets,
    outstandingDebt: netBorrowed,
    totalInvested,
    totalDraws,
    retainedEarnings,
  });

  res.json(balanceSheet);
});

export default router;
