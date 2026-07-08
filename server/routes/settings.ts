import { Router, type Request, type Response } from "express";
import { UserSettingsModel } from "../models/UserSettings.js";
import { requireUser, getUserId } from "../middleware/auth.js";

/**
 * Settings API — the founder's per-user preferences.
 *
 * GET returns the user's settings, creating a default record on first
 * access. PATCH updates them (currently just currency). Scoped to the
 * signed-in user.
 *
 * Routes:
 *   GET   /api/settings
 *   PATCH /api/settings   { currency? }
 */
const router = Router();

router.use(requireUser);

const ALLOWED_CURRENCIES = ["USD", "AUD", "INR", "EUR", "GBP", "CAD", "SGD"];

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  let settings = await UserSettingsModel.findOne({ userId });
  if (!settings) {
    settings = await UserSettingsModel.create({ userId });
  }
  res.json(settings);
});

router.patch("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const { currency } = req.body;
  const update: Record<string, unknown> = {};

  if (currency !== undefined) {
    if (!ALLOWED_CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: "Unsupported currency." });
    }
    update.currency = currency;
  }

  const settings = await UserSettingsModel.findOneAndUpdate(
    { userId },
    update,
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.json(settings);
});

export default router;