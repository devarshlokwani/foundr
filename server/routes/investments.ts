import { Router, type Request, type Response } from "express";
import { InvestmentModel } from "../models/Investment.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { logActivity } from "../lib/activityLog.js";

/**
 * Investments API — money the founder has put into one business.
 * Scoped to the signed-in user and `?businessId=`, same as transactions.
 * Deletion is soft — see routes/transactions.ts's doc comment for the
 * full reasoning, identical here.
 *
 * Routes:
 *   GET    /api/investments?businessId=       list (newest first)
 *   POST   /api/investments?businessId=       create
 *   DELETE /api/investments/:id?businessId=   soft-delete
 *   POST   /api/investments/:id/restore       undo a soft-delete
 *   DELETE /api/investments/:id/permanent     permanently delete (Trash only)
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const items = await InvestmentModel.find({ userId, businessId, deletedAt: null }).sort({ date: -1 });
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

  void logActivity({
    userId: userId!, businessId: businessId!, action: "create", entityType: "investment", entityId: String(created._id),
    summary: `Added ${created.amount} investment — ${created.source}`,
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
    { _id: req.params.id, userId, businessId, deletedAt: null },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Investment not found." });

  void logActivity({
    userId: userId!, businessId: businessId!, action: "update", entityType: "investment", entityId: String(updated._id),
    summary: `Updated investment — ${updated.source}`,
  });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const deleted = await InvestmentModel.findOneAndUpdate(
    { _id: req.params.id, userId, businessId, deletedAt: null },
    { deletedAt: new Date() },
    { new: true }
  );
  if (!deleted) return res.status(404).json({ error: "Investment not found." });

  void logActivity({
    userId: userId!, businessId: businessId!, action: "delete", entityType: "investment", entityId: String(deleted._id),
    summary: `Deleted ${deleted.amount} investment — ${deleted.source}`,
  });
  res.json({ ok: true });
});

router.post("/:id/restore", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const restored = await InvestmentModel.findOneAndUpdate(
    { _id: req.params.id, userId, businessId, deletedAt: { $ne: null } },
    { deletedAt: null },
    { new: true }
  );
  if (!restored) return res.status(404).json({ error: "Investment not found in trash." });

  void logActivity({
    userId: userId!, businessId: businessId!, action: "restore", entityType: "investment", entityId: String(restored._id),
    summary: `Restored investment — ${restored.source}`,
  });
  res.json(restored);
});

router.delete("/:id/permanent", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const deleted = await InvestmentModel.findOneAndDelete({ _id: req.params.id, userId, businessId, deletedAt: { $ne: null } });
  if (!deleted) return res.status(404).json({ error: "Investment not found in trash." });
  res.json({ ok: true });
});

export default router;
