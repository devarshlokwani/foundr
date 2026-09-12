import { Router, type Request, type Response } from "express";
import { ExpenseModel } from "../models/Expense.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { logActivity } from "../lib/activityLog.js";
import { checkEntryQuota } from "../lib/entitlements.js";

/**
 * Transactions API: the founder's income and expense entries for one
 * business. Every route is scoped to the signed-in user AND the business
 * named in `?businessId=`, so a founder can only ever read or change their
 * own records, and one startup's numbers never bleed into another's.
 *
 * Deleting is soft: DELETE sets `deletedAt` rather than removing the
 * document, so it can be undone. Every read here filters `deletedAt:
 * null`; the Trash view (see routes/trash.ts) is the only place that
 * reads the opposite.
 *
 * Routes:
 *   GET    /api/transactions?businessId=       list (newest first)
 *   POST   /api/transactions?businessId=       create
 *   PATCH  /api/transactions/:id?businessId=   update
 *   DELETE /api/transactions/:id?businessId=   soft-delete
 *   POST   /api/transactions/:id/restore       undo a soft-delete
 *   DELETE /api/transactions/:id/permanent     permanently delete (Trash only)
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const items = await ExpenseModel.find({ userId, businessId, deletedAt: null }).sort({ date: -1 });
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

  const allowed = await checkEntryQuota(userId!);
  if (!allowed.ok) {
    return res.status(402).json({ error: allowed.reason, limit: allowed.limit, used: allowed.used });
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

  const kindLabel = created.type === "income" ? "revenue" : "expense";
  void logActivity({
    userId: userId!, businessId: businessId!, action: "create", entityType: "expense", entityId: String(created._id),
    summary: `Added ${created.amount} ${kindLabel}: ${created.category}`,
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const updated = await ExpenseModel.findOneAndUpdate(
    { _id: req.params.id, userId, businessId, deletedAt: null },
    req.body,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Transaction not found." });

  const kindLabel = updated.type === "income" ? "revenue" : "expense";
  void logActivity({
    userId: userId!, businessId: businessId!, action: "update", entityType: "expense", entityId: String(updated._id),
    summary: `Updated ${kindLabel}: ${updated.category}`,
  });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const deleted = await ExpenseModel.findOneAndUpdate(
    { _id: req.params.id, userId, businessId, deletedAt: null },
    { deletedAt: new Date() },
    { new: true }
  );
  if (!deleted) return res.status(404).json({ error: "Transaction not found." });

  const kindLabel = deleted.type === "income" ? "revenue" : "expense";
  void logActivity({
    userId: userId!, businessId: businessId!, action: "delete", entityType: "expense", entityId: String(deleted._id),
    summary: `Deleted ${deleted.amount} ${kindLabel}: ${deleted.category}`,
  });
  res.json({ ok: true });
});

router.post("/:id/restore", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const restored = await ExpenseModel.findOneAndUpdate(
    { _id: req.params.id, userId, businessId, deletedAt: { $ne: null } },
    { deletedAt: null },
    { new: true }
  );
  if (!restored) return res.status(404).json({ error: "Transaction not found in trash." });

  const kindLabel = restored.type === "income" ? "revenue" : "expense";
  void logActivity({
    userId: userId!, businessId: businessId!, action: "restore", entityType: "expense", entityId: String(restored._id),
    summary: `Restored ${kindLabel}: ${restored.category}`,
  });
  res.json(restored);
});

router.delete("/:id/permanent", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const deleted = await ExpenseModel.findOneAndDelete({ _id: req.params.id, userId, businessId, deletedAt: { $ne: null } });
  if (!deleted) return res.status(404).json({ error: "Transaction not found in trash." });
  res.json({ ok: true });
});

export default router;
