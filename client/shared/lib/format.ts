/**
 * Money formatting for Foundr: the single source of truth for currency.
 *
 * Supports multiple currencies. The active currency is the founder's saved
 * preference (loaded from /api/settings at app start via setCurrency). On a
 * brand-new account we seed a sensible default from the browser locale, then
 * the user can change it on the settings page.
 *
 * Everything that shows an amount calls formatMoney(); no component
 * hardcodes a symbol, so changing currency updates the whole app.
 */

export type CurrencyCode = "USD" | "AUD" | "INR" | "EUR" | "GBP" | "CAD" | "SGD";

interface CurrencyInfo {
  code: CurrencyCode;
  label: string;
  locale: string;
}

/** The currencies a founder can choose from. */
export const CURRENCIES: CurrencyInfo[] = [
  { code: "USD", label: "US Dollar", locale: "en-US" },
  { code: "AUD", label: "Australian Dollar", locale: "en-AU" },
  { code: "INR", label: "Indian Rupee", locale: "en-IN" },
  { code: "EUR", label: "Euro", locale: "en-IE" },
  { code: "GBP", label: "British Pound", locale: "en-GB" },
  { code: "CAD", label: "Canadian Dollar", locale: "en-CA" },
  { code: "SGD", label: "Singapore Dollar", locale: "en-SG" },
];

// Active currency for this session. Defaults to AUD until settings load.
let active: CurrencyCode = "AUD";

/** Set the active currency (called once after loading the user's settings). */
export function setCurrency(code: CurrencyCode): void {
  if (CURRENCIES.some((c) => c.code === code)) active = code;
}

/** The currently active currency code. */
export function getCurrency(): CurrencyCode {
  return active;
}

function localeFor(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.locale ?? "en-US";
}

/**
 * Guess a sensible default currency from the browser's locale, for brand-new
 * users who haven't chosen yet. Falls back to USD if we can't map it.
 */
export function detectDefaultCurrency(): CurrencyCode {
  const lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  const region = lang.split("-")[1]?.toUpperCase();
  const byRegion: Record<string, CurrencyCode> = {
    US: "USD", AU: "AUD", IN: "INR", GB: "GBP", CA: "CAD", SG: "SGD",
    IE: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR",
  };
  return (region && byRegion[region]) || "USD";
}

/**
 * Format a number as money in the active currency, e.g. 1200 -> "$1,200".
 * No decimals by default; pass { decimals: true } for cents.
 */
export function formatMoney(amount: number, opts: { decimals?: boolean } = {}): string {
  return new Intl.NumberFormat(localeFor(active), {
    style: "currency",
    currency: active,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(amount);
}

/** Just the active currency symbol, e.g. for input prefixes. */
export function currencySymbol(): string {
  const parts = new Intl.NumberFormat(localeFor(active), {
    style: "currency",
    currency: active,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? "$";
}