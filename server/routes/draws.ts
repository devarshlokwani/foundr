import { Router, type Request, type Response } from "express";
import { DrawModel } from "../models/Draw.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { logActivity } from "../lib/activityLog.js";

/**
 * Draws API: money the founder has taken out of one business.
 * Scoped to the signed-in user and `?businessId=`, same as investments.
 * Deletion is soft; see routes/transactions.ts's doc comment for the
 * full reasoning, identical here.
 *
 * Routes:
 *   GET    /api/draws?businessId=       list (newest first)
 *   POST   /api/draws?businessId=       create
 *   PATCH  /api/draws/:id?businessId=   update
 *   DELETE /api/draws/:id?businessId=   soft-delete
 *   POST   /api/draws/:id/restore       undo a soft-delete
 *   DELETE /api/draws/:id/permanent     permanently delete (Trash only)
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const items = await DrawModel.find({ userId, businessId, deletedAt: null }).sort({ date: -1 });
  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const { amount, category, note, date } = req.body;

  if (typeof amount !== "number" || amount < 0) {
    return res.status(400).json({ error: "Amount must be a positive number." });
  }
  if (!category || typeof category !== "string") {
    return res.status(400).json({ error: "A category is required." });
  }

  const created = await DrawModel.create({
    userId,
    businessId,
    amount,
    category: category.trim(),
    note: typeof note === "string" ? note.trim() : "",
    date: date ? new Date(date) : new Date(),
  });

  void logActivity({
    userId: userId!, businessId: businessId!, action: "create", entityType: "draw", entityId: String(created._id),
    summary: `Added ${created.amount} draw: ${created.category}`,
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
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
    { _id: req.params.id, userId, businessId, deletedAt: null },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Draw not found." });

  void logActivity({
    userId: userId!, businessId: businessId!, action: "update", entityType: "draw", entityId: String(updated._id),
    summary: `Updated draw: ${updated.category}`,
  });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const deleted = await DrawModel.findOneAndUpdate(
    { _id: req.params.id, userId, businessId, deletedAt: null },
    { deletedAt: new Date() },
    { new: true }
  );
  if (!deleted) return res.status(404).json({ error: "Draw not found." });

  void logActivity({
    userId: userId!, businessId: businessId!, action: "delete", entityType: "draw", entityId: String(deleted._id),
    summary: `Deleted ${deleted.amount} draw: ${deleted.category}`,
  });
  res.json({ ok: true });
});

router.post("/:id/restore", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const restored = await DrawModel.findOneAndUpdate(
    { _id: req.params.id, userId, businessId, deletedAt: { $ne: null } },
    { deletedAt: null },
    { new: true }
  );
  if (!restored) return res.status(404).json({ error: "Draw not found in trash." });

  void logActivity({
    userId: userId!, businessId: businessId!, action: "restore", entityType: "draw", entityId: String(restored._id),
    summary: `Restored draw: ${restored.category}`,
  });
  res.json(restored);
});

router.delete("/:id/permanent", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const deleted = await DrawModel.findOneAndDelete({ _id: req.params.id, userId, businessId, deletedAt: { $ne: null } });
  if (!deleted) return res.status(404).json({ error: "Draw not found in trash." });
  res.json({ ok: true });
});

export default router;
