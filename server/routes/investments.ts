import { Router, type Request, type Response } from "express";
import { InvestmentModel } from "../models/Investment.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";

/**
 * Investments API — money the founder has put into one business.
 * Scoped to the signed-in user and `?businessId=`, same as transactions.
 *
 * Routes:
 *   GET    /api/investments?businessId=      list (newest first)
 *   POST   /api/investments?businessId=      create
 *   DELETE /api/investments/:id?businessId=  delete
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const items = await InvestmentModel.find({ userId, businessId }).sort({ date: -1 });
  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const { amount, source, note, date } = req.body;

  if (typeof amount !== "number" || amount < 0) {
    return res.status(400).json({ error: "Amount must be a positive number." });
  }

  const created = await InvestmentModel.create({
    userId,
    businessId,
    amount,
    source: typeof source === "string" && source.trim() ? source.trim() : "Personal savings",
    note: typeof note === "string" ? note.trim() : "",
    date: date ? new Date(date) : new Date(),
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
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
    { _id: req.params.id, userId, businessId },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Investment not found." });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const deleted = await InvestmentModel.findOneAndDelete({ _id: req.params.id, userId, businessId });
  if (!deleted) return res.status(404).json({ error: "Investment not found." });
  res.json({ ok: true });
});

export default router;
