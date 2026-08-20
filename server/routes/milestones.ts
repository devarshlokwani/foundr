import { Router, type Request, type Response } from "express";
import { MilestoneModel } from "../models/Milestone.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";

/**
 * Milestones API — the founder's goals for one business.
 * Scoped to the signed-in user and `?businessId=`.
 *
 * Routes:
 *   GET    /api/milestones?businessId=      list
 *   POST   /api/milestones?businessId=      create
 *   PATCH  /api/milestones/:id?businessId=  update (e.g. mark achieved)
 *   DELETE /api/milestones/:id?businessId=  delete
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const items = await MilestoneModel.find({ userId, businessId }).sort({ createdAt: 1 });
  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const { title, targetAmount, targetDate } = req.body;

  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "A title is required." });
  }

  const created = await MilestoneModel.create({
    userId,
    businessId,
    title: title.trim(),
    targetAmount: typeof targetAmount === "number" ? targetAmount : null,
    targetDate: targetDate ? new Date(targetDate) : null,
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const update: Record<string, unknown> = { ...req.body };

  // When marking achieved, stamp the time; when un-achieving, clear it.
  if (typeof update.achieved === "boolean") {
    update.achievedAt = update.achieved ? new Date() : null;
  }

  const updated = await MilestoneModel.findOneAndUpdate(
    { _id: req.params.id, userId, businessId },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Milestone not found." });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const businessId = req.businessId;
  const deleted = await MilestoneModel.findOneAndDelete({ _id: req.params.id, userId, businessId });
  if (!deleted) return res.status(404).json({ error: "Milestone not found." });
  res.json({ ok: true });
});

export default router;
