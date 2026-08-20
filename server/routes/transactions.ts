import { Router, type Request, type Response } from "express";
import { ExpenseModel } from "../models/Expense.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";

/**
 * Transactions API — the founder's income and expense entries for one
 * business. Every route is scoped to the signed-in user AND the business
 * named in `?businessId=`, so a founder can only ever read or change their
 * own records, and one startup's numbers never bleed into another's.
 *
 * Routes:
 *   GET    /api/transactions?businessId=      list (newest first)
 *   POST   /api/transactions?businessId=      create
 *   PATCH  /api/transactions/:id?businessId=  update
 *   DELETE /api/transactions/:id?businessId=  delete
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const items = await ExpenseModel.find({ userId, businessId }).sort({ date: -1 });
  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const { type, amount, category, note, date, isCapital } = req.body;

  if (type !== "expense" && type !== "income") {
    return res.status(400).json({ error: "Type must be 'expense' or 'income'." });
  }
  if (typeof amount !== "number" || amount < 0) {
    return res.status(400).json({ error: "Amount must be a positive number." });
  }
  if (!category || typeof category !== "string") {
    return res.status(400).json({ error: "A category is required." });
  }

  const created = await ExpenseModel.create({
    userId,
    businessId,
    type,
    amount,
    category: category.trim(),
    note: typeof note === "string" ? note.trim() : "",
    date: date ? new Date(date) : new Date(),
    isCapital: type === "expense" && isCapital === true,
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const updated = await ExpenseModel.findOneAndUpdate(
    { _id: req.params.id, userId, businessId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Transaction not found." });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const deleted = await ExpenseModel.findOneAndDelete({ _id: req.params.id, userId, businessId });
  if (!deleted) return res.status(404).json({ error: "Transaction not found." });
  res.json({ ok: true });
});

export default router;
