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

/** Fixed preview colours for each theme, shown regardless of the
 * currently active theme, so a swatch always represents its own theme.
 * Shared by the Settings page and the profile menu's quick switcher. */
export const THEME_OPTIONS: { code: ThemeCode; label: string; desc: string; swatch: [string, string, string] }[] = [
  { code: "light", label: "Original", desc: "Foundr's original look", swatch: ["#ECEAE3", "#2D4A3E", "#8AAF9A"] },
  { code: "dark", label: "Dark", desc: "Easy on the eyes", swatch: ["#14161A", "#3D6B54", "#7FB69B"] },
  { code: "royal", label: "Royal", desc: "Purple and gold", swatch: ["#F4F0FA", "#4B2E83", "#C9A227"] },
  { code: "ocean", label: "Ocean", desc: "Cool blue and teal", swatch: ["#EAF1F3", "#1F5A6E", "#6FA8B8"] },
  { code: "sunset", label: "Sunset", desc: "Warm terracotta", swatch: ["#FBF0E6", "#B5502E", "#E3A85C"] },
  { code: "slate", label: "Slate", desc: "Dark and monochrome", swatch: ["#15181D", "#456885", "#8B9BAE"] },
];

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
