import { Router, type Request, type Response } from "express";
import { DebtModel } from "../models/Debt.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";

/**
 * Debt API — money borrowed for one business, and repayments against it.
 * Scoped to the signed-in user and `?businessId=`, same as investments.
 * The outstanding balance (borrowed minus repaid) is always derived from
 * this ledger, not stored, so it can't drift out of sync.
 *
 * Routes:
 *   GET    /api/debts?businessId=      list (newest first)
 *   POST   /api/debts?businessId=      create { type: "borrow"|"repay", amount, source?, note?, date? }
 *   PATCH  /api/debts/:id?businessId=  update
 *   DELETE /api/debts/:id?businessId=  delete
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

const ALLOWED_TYPES = ["borrow", "repay"];

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const items = await DebtModel.find({ userId, businessId }).sort({ date: -1 });
  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const { type, amount, source, note, date } = req.body;

  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: "Type must be 'borrow' or 'repay'." });
  }
  if (typeof amount !== "number" || amount < 0) {
    return res.status(400).json({ error: "Amount must be a positive number." });
  }

  const created = await DebtModel.create({
    userId,
    businessId,
    type,
    amount,
    source: typeof source === "string" && source.trim() ? source.trim() : "Bank loan",
    note: typeof note === "string" ? note.trim() : "",
    date: date ? new Date(date) : new Date(),
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const { type, amount, source, note, date } = req.body;
  const update: Record<string, unknown> = {};

  if (type !== undefined) {
    if (!ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({ error: "Type must be 'borrow' or 'repay'." });
    }
    update.type = type;
  }
  if (amount !== undefined) {
    if (typeof amount !== "number" || amount < 0) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }
    update.amount = amount;
  }
  if (typeof source === "string") update.source = source.trim();
  if (typeof note === "string") update.note = note.trim();
  if (date) update.date = new Date(date);

  const updated = await DebtModel.findOneAndUpdate(
    { _id: req.params.id, userId, businessId },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Debt entry not found." });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const deleted = await DebtModel.findOneAndDelete({ _id: req.params.id, userId, businessId });
  if (!deleted) return res.status(404).json({ error: "Debt entry not found." });
  res.json({ ok: true });
});

export default router;
