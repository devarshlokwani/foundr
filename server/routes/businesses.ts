import { Router, type Request, type Response } from "express";
import { BusinessModel } from "../models/Business.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { ensureDefaultBusiness, ownsBusiness } from "../lib/business.js";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { DrawModel } from "../models/Draw.js";
import { DebtModel } from "../models/Debt.js";

/**
 * Businesses API — a founder's startups/side hustles. Every ledger entry
 * belongs to exactly one of these, so each gets its own isolated
 * dashboard. GET is the entry point that also runs the one-time migration
 * for founders who existed before multi-business support did.
 *
 * Routes:
 *   GET    /api/businesses      list (runs ensureDefaultBusiness first)
 *   POST   /api/businesses      create { name, currency? }
 *   PATCH  /api/businesses/:id  update { name?, currency? }
 *   DELETE /api/businesses/:id  delete (blocked if it still has ledger data)
 */
const router = Router();

const ALLOWED_CURRENCIES = ["USD", "AUD", "INR", "EUR", "GBP", "CAD", "SGD"];

router.use(requireUser);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  await ensureDefaultBusiness(userId);
  const businesses = await BusinessModel.find({ userId }).sort({ createdAt: 1 });
  res.json(businesses);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const { name, currency } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "A business name is required." });
  }
  if (currency !== undefined && !ALLOWED_CURRENCIES.includes(currency)) {
    return res.status(400).json({ error: "Unsupported currency." });
  }
  const created = await BusinessModel.create({
    userId,
    name: name.trim(),
    ...(currency !== undefined ? { currency } : {}),
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const { name, currency } = req.body;
  const update: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "A business name is required." });
    }
    update.name = name.trim();
  }

  if (currency !== undefined) {
    if (!ALLOWED_CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: "Unsupported currency." });
    }
    update.currency = currency;
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }

  const updated = await BusinessModel.findOneAndUpdate(
    { _id: req.params.id, userId },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Business not found." });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.params.id;

  if (!(await ownsBusiness(userId, businessId))) {
    return res.status(404).json({ error: "Business not found." });
  }

  const [expenses, investments, draws, debts] = await Promise.all([
    ExpenseModel.countDocuments({ userId, businessId }),
    InvestmentModel.countDocuments({ userId, businessId }),
    DrawModel.countDocuments({ userId, businessId }),
    DebtModel.countDocuments({ userId, businessId }),
  ]);
  if (expenses + investments + draws + debts > 0) {
    return res.status(409).json({ error: "This business still has tracked entries — remove them first." });
  }

  await BusinessModel.deleteOne({ _id: businessId, userId });
  res.json({ ok: true });
});

export default router;
