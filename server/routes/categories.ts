import { Router, type Request, type Response } from "express";
import { CategoryModel } from "../models/Category.js";
import { requireUser, getUserId } from "../middleware/auth.js";

/**
 * Categories API — each founder's personalised category lists.
 * Scoped to the signed-in user.
 *
 * On the first GET, if the user has no categories yet, we seed a small
 * set of sensible defaults so they aren't staring at a blank list. After
 * that it's entirely theirs to add to or delete.
 *
 * Routes:
 *   GET    /api/categories          all of the user's categories
 *   POST   /api/categories          create one { kind, name }
 *   DELETE /api/categories/:id      delete one
 */
const router = Router();

router.use(requireUser);

const DEFAULTS: Record<"expense" | "revenue" | "investment", string[]> = {
  expense: ["Marketing", "Tools / SaaS", "Design"],
  revenue: ["Sales", "Consulting"],
  investment: ["Personal savings", "Family / friends"],
};

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;

  let items = await CategoryModel.find({ userId }).sort({ kind: 1, name: 1 });

  // Seed defaults the first time this user asks for categories.
  if (items.length === 0) {
    const toCreate = (Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>).flatMap((kind) =>
      DEFAULTS[kind].map((name) => ({ userId, kind, name }))
    );
    await CategoryModel.insertMany(toCreate);
    items = await CategoryModel.find({ userId }).sort({ kind: 1, name: 1 });
  }

  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const { kind, name } = req.body;

  if (kind !== "expense" && kind !== "revenue" && kind !== "investment") {
    return res.status(400).json({ error: "Invalid category type." });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "A category name is required." });
  }

  try {
    const created = await CategoryModel.create({ userId, kind, name: name.trim() });
    res.status(201).json(created);
  } catch (err) {
    // Duplicate (same user + kind + name) trips the unique index.
    if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000) {
      return res.status(409).json({ error: "You already have that category." });
    }
    throw err;
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const deleted = await CategoryModel.findOneAndDelete({ _id: req.params.id, userId });
  if (!deleted) return res.status(404).json({ error: "Category not found." });
  res.json({ ok: true });
});

export default router;