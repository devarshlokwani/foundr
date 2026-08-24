import { Router, type Request, type Response } from "express";
import { UserSettingsModel } from "../models/UserSettings.js";
import { BusinessModel } from "../models/Business.js";
import { requireUser, getUserId } from "../middleware/auth.js";

/**
 * Settings API: the founder's per-user preferences.
 *
 * GET returns the user's settings, creating a default record on first
 * access. PATCH updates them. Scoped to the signed-in user. Name/email are
 * Clerk identity fields and never live here; gender is a Foundr-specific
 * profile fact that does. Currency and business name are per-business, not
 * per-user; see /api/businesses instead.
 *
 * Routes:
 *   GET   /api/settings
 *   PATCH /api/settings   { theme?, gender?, activeBusinessId?, onboarded? }
 */
const router = Router();

router.use(requireUser);

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
  const { theme, gender, activeBusinessId, onboarded } = req.body;
  const update: Record<string, unknown> = {};

  if (theme !== undefined) {
    if (!ALLOWED_THEMES.includes(theme)) {
      return res.status(400).json({ error: "Unsupported theme." });
    }
    update.theme = theme;
  }

  if (gender !== undefined) {
    if (!ALLOWED_GENDERS.includes(gender)) {
      return res.status(400).json({ error: "Unsupported gender option." });
    }
    update.gender = gender;
  }

  if (activeBusinessId !== undefined) {
    if (typeof activeBusinessId !== "string") {
      return res.status(400).json({ error: "Invalid business." });
    }
    // Confirm the business is actually theirs before pointing the dashboard at it.
    const owns = await BusinessModel.exists({ _id: activeBusinessId, userId });
    if (!owns) {
      return res.status(404).json({ error: "Business not found." });
    }
    update.activeBusinessId = activeBusinessId;
  }

  if (onboarded !== undefined) {
    if (typeof onboarded !== "boolean") {
      return res.status(400).json({ error: "Invalid value." });
    }
    update.onboarded = onboarded;
  }

  const settings = await UserSettingsModel.findOneAndUpdate(
    { userId },
    update,
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.json(settings);
});

export default router;