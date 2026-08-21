import { Router, type Request, type Response } from "express";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { DrawModel } from "../models/Draw.js";
import { DebtModel } from "../models/Debt.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { materializeDueRules } from "../lib/recurring.js";

/**
 * Entries API — a unified, read-only timeline of everything the founder
 * has recorded for one business: expenses, revenue, investments, draws,
 * and debt, merged and sorted by date (newest first).
 *
 * Each item is normalised to a common shape so the frontend can render one
 * list. `source` carries the collection it came from, plus the original
 * id, so edit/delete can route to the right endpoint.
 *
 * Routes:
 *   GET /api/entries?businessId=
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

interface UnifiedEntry {
  id: string;
  source: "transaction" | "investment" | "draw" | "debt";
  kind: "expense" | "revenue" | "investment" | "draw" | "debt" | "repayment";
  amount: number;
  label: string;
  note: string;
  date: string;
}

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId!;

  await materializeDueRules(userId, businessId);

  const [txns, invs, draws, debts] = await Promise.all([
    ExpenseModel.find({ userId, businessId }).lean(),
    InvestmentModel.find({ userId, businessId }).lean(),
    DrawModel.find({ userId, businessId }).lean(),
    DebtModel.find({ userId, businessId }).lean(),
  ]);

  const unified: UnifiedEntry[] = [];

  for (const t of txns) {
    unified.push({
      id: String(t._id),
      source: "transaction",
      kind: t.type === "income" ? "revenue" : "expense",
      amount: t.amount,
      label: t.category,
      note: t.note ?? "",
      date: new Date(t.date).toISOString(),
    });
  }

  for (const inv of invs) {
    unified.push({
      id: String(inv._id),
      source: "investment",
      kind: "investment",
      amount: inv.amount,
      label: inv.source ?? "Personal savings",
      note: inv.note ?? "",
      date: new Date(inv.date).toISOString(),
    });
  }

  for (const d of draws) {
    unified.push({
      id: String(d._id),
      source: "draw",
      kind: "draw",
      amount: d.amount,
      label: d.category,
      note: d.note ?? "",
      date: new Date(d.date).toISOString(),
    });
  }

  for (const d of debts) {
    unified.push({
      id: String(d._id),
      source: "debt",
      kind: d.type === "borrow" ? "debt" : "repayment",
      amount: d.amount,
      label: d.source ?? "Bank loan",
      note: d.note ?? "",
      date: new Date(d.date).toISOString(),
    });
  }

  unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json(unified);
});

export default router;
