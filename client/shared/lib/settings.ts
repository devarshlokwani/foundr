import { apiGet, apiPatch } from "./api";
import { setCurrency, detectDefaultCurrency, type CurrencyCode } from "./format";
import type { UserSettings } from "./types";

/**
 * Loads the founder's settings and applies their currency for the session.
 *
 * Call once at app startup (dashboard, transactions, settings pages) before
 * rendering money. If the saved currency differs from the browser-detected
 * default and the account is brand new, the backend default (AUD) is used
 * until the user picks one on the settings page.
 *
 * Returns the loaded settings so the settings page can show current values.
 */
export async function loadSettings(): Promise<UserSettings | null> {
  try {
    const settings = await apiGet<UserSettings>("/settings");
    setCurrency(settings.currency as CurrencyCode);
    return settings;
  } catch {
    setCurrency(detectDefaultCurrency());
    return null;
  }
}

/** Save a new currency choice and apply it immediately. */
export async function saveCurrency(currency: CurrencyCode): Promise<void> {
  await apiPatch("/settings", { currency });
  setCurrency(currency);
}