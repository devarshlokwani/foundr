/**
 * Theme switching for the signed-in app (dashboard, transactions, margins,
 * settings). The public landing/auth pages keep the fixed brand look and
 * don't use this.
 *
 * Applied by setting `data-theme` on <html>, which tokens.css keys off of.
 * Cached in localStorage so a page's inline bootstrap script (see
 * dashboard.html etc.) can apply it before first paint, avoiding a flash
 * of the wrong theme. loadSettings() in settings.ts reconciles this with
 * the backend value once it loads, in case the user switched devices.
 */

export type ThemeCode = "light" | "dark" | "royal" | "ocean" | "sunset" | "slate";

const THEME_CODES: ThemeCode[] = ["light", "dark", "royal", "ocean", "sunset", "slate"];

const STORAGE_KEY = "foundr-theme";

export function applyTheme(theme: ThemeCode): void {
  if (theme === "light") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private browsing); theme still applies for this load.
  }
}

/** The last-applied theme, if any was cached locally. Defaults to "light". */
export function getStoredTheme(): ThemeCode {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return (THEME_CODES as string[]).includes(t ?? "") ? (t as ThemeCode) : "light";
  } catch {
    return "light";
  }
}
