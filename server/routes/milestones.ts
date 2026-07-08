import { Router, type Request, type Response } from "express";
import { MilestoneModel } from "../models/Milestone.js";
import { requireUser, getUserId } from "../middleware/auth.js";

/**
 * Milestones API — the founder's goals.
 * Scoped to the signed-in user.
 *
 * Routes:
 *   GET    /api/milestones      list
 *   POST   /api/milestones      create
 *   PATCH  /api/milestones/:id  update (e.g. mark achieved)
 *   DELETE /api/milestones/:id  delete
 */
const router = Router();

router.use(requireUser);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const items = await MilestoneModel.find({ userId }).sort({ createdAt: 1 });
  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { title, targetAmount, targetDate } = req.body;

  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "A title is required." });
  }

  const created = await MilestoneModel.create({
    userId,
    title: title.trim(),
    targetAmount: typeof targetAmount === "number" ? targetAmount : null,
    targetDate: targetDate ? new Date(targetDate) : null,
  });
  res.status(201).json(created);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const update: Record<string, unknown> = { ...req.body };

  // When marking achieved, stamp the time; when un-achieving, clear it.
  if (typeof update.achieved === "boolean") {
    update.achievedAt = update.achieved ? new Date() : null;
  }

  const updated = await MilestoneModel.findOneAndUpdate(
    { _id: req.params.id, userId },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ error: "Milestone not found." });
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const deleted = await MilestoneModel.findOneAndDelete({ _id: req.params.id, userId });
  if (!deleted) return res.status(404).json({ error: "Milestone not found." });
  res.json({ ok: true });
});

export default router;