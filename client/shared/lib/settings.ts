import { apiGet, apiPatch } from "./api";
import { applyTheme, getStoredTheme, type ThemeCode } from "./theme";
import type { UserSettings } from "./types";

/**
 * Loads the founder's settings and applies their theme for the session.
 * Currency isn't here: it's per-business, applied when the active
 * business is resolved (see business.ts's resolveActiveBusiness).
 *
 * Call once at app startup (dashboard, transactions, margins, settings
 * pages) before rendering content. Theme falls back to whatever's cached
 * locally (already applied by each page's inline bootstrap script) so
 * there's no flash on load, then reconciles with the backend value in
 * case it changed on another device.
 *
 * Returns the loaded settings so the settings page can show current values.
 */
export async function loadSettings(): Promise<UserSettings | null> {
  try {
    const settings = await apiGet<UserSettings>("/settings");
    applyTheme(settings.theme as ThemeCode);
    return settings;
  } catch {
    applyTheme(getStoredTheme());
    return null;
  }
}

/** Save a new theme choice and apply it immediately. */
export async function saveTheme(theme: ThemeCode): Promise<void> {
  await apiPatch("/settings", { theme });
  applyTheme(theme);
}

/** Save profile fields that live in our DB (not Clerk identity data). */
export async function saveProfileFields(fields: {
  gender?: UserSettings["gender"];
}): Promise<UserSettings> {
  return apiPatch<UserSettings>("/settings", fields);
}

/** Marks the one-time onboarding wizard as complete; it never shows again. */
export async function markOnboarded(): Promise<void> {
  await apiPatch("/settings", { onboarded: true });
}