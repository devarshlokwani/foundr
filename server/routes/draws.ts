import { Router, type Request, type Response } from "express";
import { DrawModel } from "../models/Draw.js";
import { requireUser, getUserId } from "../middleware/auth.js";

/**
 * Draws API — money the founder has taken out of the business.
 * Scoped to the signed-in user, same as investments.
 *
 * Routes:
 *   GET    /api/draws      list (newest first)
 *   POST   /api/draws      create
 *   PATCH  /api/draws/:id  update
 *   DELETE /api/draws/:id  delete
 */
const router = Router();

router.use(requireUser);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const items = await DrawModel.find({ userId }).sort({ date: -1 });
  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { amount, category, note, date } = req.body;

  if (typeof amount !== "number" || amount < 0) {
    return res.status(400).json({ error: "Amount must be a positive number." });
  }
  if (!category || typeof category !== "string") {
    return res.status(400).json({ error: "A category is required." });
  }

  const created = await DrawModel.create({
    userId,
    amount,
    category: category.trim(),
    note: typeof note === "string" ? note.trim() : "",
    date: date ? new Date(date) : new Date(),
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { amount, category, note, date } = req.body;
  const update: Record<string, unknown> = {};

  if (amount !== undefined) {
    if (typeof amount !== "number" || amount < 0) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }
    update.amount = amount;
  }
  if (typeof category === "string") update.category = category.trim();
  if (typeof note === "string") update.note = note.trim();
  if (date) update.date = new Date(date);

  const updated = await DrawModel.findOneAndUpdate(
    { _id: req.params.id, userId },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Draw not found." });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const deleted = await DrawModel.findOneAndDelete({ _id: req.params.id, userId });
  if (!deleted) return res.status(404).json({ error: "Draw not found." });
  res.json({ ok: true });
});

export default router;
