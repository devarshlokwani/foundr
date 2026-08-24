import { Router, type Request, type Response } from "express";
import { RecurringRuleModel } from "../models/RecurringRule.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { logActivity } from "../lib/activityLog.js";

/**
 * Recurring rules API — expense/revenue entries a founder wants added
 * automatically on a schedule (weekly, monthly, yearly), instead of
 * re-typing them every period. Materialization into real entries happens
 * lazily elsewhere (see lib/recurring.ts); this is just CRUD on the rules.
 *
 * Routes:
 *   GET    /api/recurring?businessId=      list, newest first
 *   POST   /api/recurring?businessId=      create
 *   PATCH  /api/recurring/:id?businessId=  edit any field, and/or pause/resume (toggle active)
 *   DELETE /api/recurring/:id?businessId=  cancel
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;
  const items = await RecurringRuleModel.find({ userId, businessId }).sort({ createdAt: -1 });
  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;
  const { kind, amount, category, note, frequency, startDate } = req.body;

  if (kind !== "expense" && kind !== "revenue") {
    return res.status(400).json({ error: "Kind must be 'expense' or 'revenue'." });
  }
  if (typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ error: "Amount must be a positive number." });
  }
  if (!category || typeof category !== "string") {
    return res.status(400).json({ error: "A category is required." });
  }
  if (!["weekly", "monthly", "yearly"].includes(frequency)) {
    return res.status(400).json({ error: "Frequency must be weekly, monthly, or yearly." });
  }

  const created = await RecurringRuleModel.create({
    userId,
    businessId,
    kind,
    amount,
    category: category.trim(),
    note: typeof note === "string" ? note.trim() : "",
    frequency,
    nextRunDate: startDate ? new Date(startDate) : new Date(),
    active: true,
  });

  void logActivity({
    userId, businessId: businessId!, action: "create", entityType: "recurring", entityId: String(created._id),
    summary: `Added recurring ${created.kind} — ${created.category} (${created.frequency})`,
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;
  const { active, kind, amount, category, note, frequency, nextRunDate } = req.body;
  const update: Record<string, unknown> = {};

  if (active !== undefined) {
    if (typeof active !== "boolean") {
      return res.status(400).json({ error: "active must be true or false." });
    }
    update.active = active;
  }
  if (kind !== undefined) {
    if (kind !== "expense" && kind !== "revenue") {
      return res.status(400).json({ error: "Kind must be 'expense' or 'revenue'." });
    }
    update.kind = kind;
  }
  if (amount !== undefined) {
    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }
    update.amount = amount;
  }
  if (category !== undefined) {
    if (!category || typeof category !== "string") {
      return res.status(400).json({ error: "A category is required." });
    }
    update.category = category.trim();
  }
  if (typeof note === "string") update.note = note.trim();
  if (frequency !== undefined) {
    if (!["weekly", "monthly", "yearly"].includes(frequency)) {
      return res.status(400).json({ error: "Frequency must be weekly, monthly, or yearly." });
    }
    update.frequency = frequency;
  }
  if (nextRunDate) update.nextRunDate = new Date(nextRunDate);

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }

  const updated = await RecurringRuleModel.findOneAndUpdate(
    { _id: req.params.id, userId, businessId },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Recurring rule not found." });

  const summary = Object.keys(update).length === 1 && "active" in update
    ? `${updated.active ? "Resumed" : "Paused"} recurring ${updated.kind} — ${updated.category}`
    : `Updated recurring ${updated.kind} — ${updated.category}`;
  void logActivity({
    userId, businessId: businessId!, action: "update", entityType: "recurring", entityId: String(updated._id),
    summary,
  });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;
  const deleted = await RecurringRuleModel.findOneAndDelete({ _id: req.params.id, userId, businessId });
  if (!deleted) return res.status(404).json({ error: "Recurring rule not found." });

  void logActivity({
    userId, businessId: businessId!, action: "delete", entityType: "recurring", entityId: String(deleted._id),
    summary: `Deleted recurring ${deleted.kind} — ${deleted.category}`,
  });
  res.json({ ok: true });
});

export default router;
