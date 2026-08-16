import { Router, type Request, type Response } from "express";
import { UserSettingsModel } from "../models/UserSettings.js";
import { requireUser, getUserId } from "../middleware/auth.js";

/**
 * Settings API — the founder's per-user preferences.
 *
 * GET returns the user's settings, creating a default record on first
 * access. PATCH updates them. Scoped to the signed-in user. Name/email are
 * Clerk identity fields and never live here — businessName and gender are
 * Foundr-specific profile facts that do.
 *
 * Routes:
 *   GET   /api/settings
 *   PATCH /api/settings   { currency?, theme?, businessName?, gender? }
 */
const router = Router();

router.use(requireUser);

const ALLOWED_CURRENCIES = ["USD", "AUD", "INR", "EUR", "GBP", "CAD", "SGD"];
const ALLOWED_THEMES = ["light", "dark", "royal", "ocean", "sunset", "slate"];
const ALLOWED_GENDERS = ["male", "female", "non_binary", "prefer_not_to_say", ""];

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
  const { currency, theme, businessName, gender } = req.body;
  const update: Record<string, unknown> = {};

  if (currency !== undefined) {
    if (!ALLOWED_CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: "Unsupported currency." });
    }
    update.currency = currency;
  }

  if (theme !== undefined) {
    if (!ALLOWED_THEMES.includes(theme)) {
      return res.status(400).json({ error: "Unsupported theme." });
    }
    update.theme = theme;
  }

  if (businessName !== undefined) {
    if (typeof businessName !== "string") {
      return res.status(400).json({ error: "Invalid business name." });
    }
    update.businessName = businessName.trim();
  }

  if (gender !== undefined) {
    if (!ALLOWED_GENDERS.includes(gender)) {
      return res.status(400).json({ error: "Unsupported gender option." });
    }
    update.gender = gender;
  }

  const settings = await UserSettingsModel.findOneAndUpdate(
    { userId },
    update,
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.json(settings);
});

export default router;