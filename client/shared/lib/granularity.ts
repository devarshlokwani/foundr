/**
 * Bucket-size control for the dashboard's and Margins Trends tab's
 * time-series line charts (cash-over-time, revenue-vs-expense). Independent
 * of dateRange.ts's range presets — this controls how *finely* a chart is
 * bucketed, not which window of time it covers.
 *
 * One shared preference cached in localStorage (same pattern as theme.ts) —
 * "how granular I like my charts" is one account-wide preference, reused
 * by both pickers rather than tracked separately per chart.
 */

export type Granularity = "day" | "biweekly" | "month";

export const GRANULARITY_OPTIONS: { code: Granularity; label: string }[] = [
  { code: "day", label: "Daily" },
  { code: "biweekly", label: "Every 2 weeks" },
  { code: "month", label: "Monthly" },
];

const STORAGE_KEY = "foundr-granularity";

export function getStoredGranularity(): Granularity {
  try {
    const g = localStorage.getItem(STORAGE_KEY);
    return (GRANULARITY_OPTIONS as { code: string }[]).some((o) => o.code === g) ? (g as Granularity) : "month";
  } catch {
    return "month";
  }
}

export function setStoredGranularity(granularity: Granularity): void {
  try {
    localStorage.setItem(STORAGE_KEY, granularity);
  } catch {
    // Storage can be unavailable (private browsing); the choice still applies for this load.
  }
}
