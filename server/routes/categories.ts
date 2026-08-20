import { Router, type Request, type Response } from "express";
import { CategoryModel } from "../models/Category.js";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";

/**
 * Categories API — each founder's personalised category lists, per
 * business. Scoped to the signed-in user and `?businessId=`.
 *
 * On the first GET for a business, if it has no categories yet, we seed a
 * small set of sensible defaults so it isn't a blank list. After that it's
 * entirely theirs to add to or delete.
 *
 * Routes:
 *   GET    /api/categories?businessId=      all of the business's categories
 *   POST   /api/categories?businessId=      create one { kind, name }
 *   DELETE /api/categories/:id?businessId=  delete one
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

const DEFAULTS: Record<"expense" | "revenue" | "investment" | "draw" | "debt", string[]> = {
  expense: ["Marketing", "Tools / SaaS", "Design"],
  revenue: ["Sales", "Consulting"],
  investment: ["Personal savings", "Family / friends"],
  draw: ["Personal", "Taxes"],
  debt: ["Bank loan", "Credit card"],
};

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;

  let items = await CategoryModel.find({ userId, businessId }).sort({ kind: 1, name: 1 });

  // Seed defaults the first time this business asks for categories.
  if (items.length === 0) {
    const toCreate = (Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>).flatMap((kind) =>
      DEFAULTS[kind].map((name) => ({ userId, businessId, kind, name }))
    );
    await CategoryModel.insertMany(toCreate);
    items = await CategoryModel.find({ userId, businessId }).sort({ kind: 1, name: 1 });
  }

  res.json(items);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;
  const { kind, name } = req.body;

  if (!["expense", "revenue", "investment", "draw", "debt"].includes(kind)) {
    return res.status(400).json({ error: "Invalid category type." });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "A category name is required." });
  }

  try {
    const created = await CategoryModel.create({ userId, businessId, kind, name: name.trim() });
    res.status(201).json(created);
  } catch (err) {
    // Duplicate (same user + business + kind + name) trips the unique index.
    if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000) {
      return res.status(409).json({ error: "You already have that category." });
    }
    throw err;
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId;
  const deleted = await CategoryModel.findOneAndDelete({ _id: req.params.id, userId, businessId });
  if (!deleted) return res.status(404).json({ error: "Category not found." });
  res.json({ ok: true });
});

export default router;
