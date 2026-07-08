import { Router, type Request, type Response } from "express";
import { ExpenseModel } from "../models/Expense.js";
import { requireUser, getUserId } from "../middleware/auth.js";

/**
 * Transactions API — the founder's income and expense entries.
 * Every route is scoped to the signed-in user via getUserId, so a
 * founder can only ever read or change their own records.
 *
 * Routes:
 *   GET    /api/transactions      list (newest first)
 *   POST   /api/transactions      create
 *   PATCH  /api/transactions/:id  update
 *   DELETE /api/transactions/:id  delete
 */
const router = Router();

router.use(requireUser);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const items = await ExpenseModel.find({ userId }).sort({ date: -1 });
  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { type, amount, category, note, date } = req.body;

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
    type,
    amount,
    category: category.trim(),
    note: typeof note === "string" ? note.trim() : "",
    date: date ? new Date(date) : new Date(),
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const updated = await ExpenseModel.findOneAndUpdate(
    { _id: req.params.id, userId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Transaction not found." });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const deleted = await ExpenseModel.findOneAndDelete({ _id: req.params.id, userId });
  if (!deleted) return res.status(404).json({ error: "Transaction not found." });
  res.json({ ok: true });
});

export default router;