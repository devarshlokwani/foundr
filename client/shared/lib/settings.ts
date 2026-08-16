import { apiGet, apiPatch } from "./api";
import { setCurrency, detectDefaultCurrency, type CurrencyCode } from "./format";
import { applyTheme, getStoredTheme, type ThemeCode } from "./theme";
import type { UserSettings } from "./types";

/**
 * Loads the founder's settings and applies their currency + theme for the
 * session.
 *
 * Call once at app startup (dashboard, transactions, margins, settings
 * pages) before rendering money or content. If the saved currency differs
 * from the browser-detected default and the account is brand new, the
 * backend default (AUD) is used until the user picks one on the settings
 * page. Theme falls back to whatever's cached locally (already applied by
 * each page's inline bootstrap script) so there's no flash on load, then
 * reconciles with the backend value in case it changed on another device.
 *
 * Returns the loaded settings so the settings page can show current values.
 */
export async function loadSettings(): Promise<UserSettings | null> {
  try {
    const settings = await apiGet<UserSettings>("/settings");
    setCurrency(settings.currency as CurrencyCode);
    applyTheme(settings.theme as ThemeCode);
    return settings;
  } catch {
    setCurrency(detectDefaultCurrency());
    applyTheme(getStoredTheme());
    return null;
  }
}

/** Save a new currency choice and apply it immediately. */
export async function saveCurrency(currency: CurrencyCode): Promise<void> {
  await apiPatch("/settings", { currency });
  setCurrency(currency);
}

/** Save a new theme choice and apply it immediately. */
export async function saveTheme(theme: ThemeCode): Promise<void> {
  await apiPatch("/settings", { theme });
  applyTheme(theme);
}

/** Save profile fields that live in our DB (not Clerk identity data). */
export async function saveProfileFields(fields: {
  businessName?: string;
  gender?: UserSettings["gender"];
}): Promise<UserSettings> {
  return apiPatch<UserSettings>("/settings", fields);
}