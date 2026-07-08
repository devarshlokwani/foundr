import { Router, type Request, type Response } from "express";
import { InvestmentModel } from "../models/Investment.js";
import { requireUser, getUserId } from "../middleware/auth.js";

/**
 * Investments API — money the founder has put into the business.
 * Scoped to the signed-in user, same as transactions.
 *
 * Routes:
 *   GET    /api/investments      list (newest first)
 *   POST   /api/investments      create
 *   DELETE /api/investments/:id  delete
 */
const router = Router();

router.use(requireUser);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const items = await InvestmentModel.find({ userId }).sort({ date: -1 });
  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { amount, source, note, date } = req.body;

  if (typeof amount !== "number" || amount < 0) {
    return res.status(400).json({ error: "Amount must be a positive number." });
  }

  const created = await InvestmentModel.create({
    userId,
    amount,
    source: typeof source === "string" && source.trim() ? source.trim() : "Personal savings",
    note: typeof note === "string" ? note.trim() : "",
    date: date ? new Date(date) : new Date(),
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { amount, source, note, date } = req.body;
  const update: Record<string, unknown> = {};

  if (amount !== undefined) {
    if (typeof amount !== "number" || amount < 0) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }
    update.amount = amount;
  }
  if (typeof source === "string") update.source = source.trim();
  if (typeof note === "string") update.note = note.trim();
  if (date) update.date = new Date(date);

  const updated = await InvestmentModel.findOneAndUpdate(
    { _id: req.params.id, userId },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Investment not found." });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const deleted = await InvestmentModel.findOneAndDelete({ _id: req.params.id, userId });
  if (!deleted) return res.status(404).json({ error: "Investment not found." });
  res.json({ ok: true });
});

export default router;