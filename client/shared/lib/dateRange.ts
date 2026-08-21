/**
 * Date-range presets for the dashboard and margins pages. No custom
 * calendar picker for v1 — a fixed set of presets matches the scope of a
 * manual-mode polish pass, not a full reporting suite.
 *
 * "All time" resolves to `null` bounds, which callers drop from the query
 * string entirely so the backend takes its default all-time path (see
 * server/lib/dateRange.ts) — never sent as an explicit huge range.
 *
 * Cached in localStorage so the picker remembers the founder's last choice
 * across page loads, same pattern as theme.ts / business.ts.
 */

export type RangePreset = "this-month" | "last-month" | "this-quarter" | "last-3-months" | "all-time";

export const RANGE_PRESETS: { code: RangePreset; label: string }[] = [
  { code: "this-month", label: "This month" },
  { code: "last-month", label: "Last month" },
  { code: "this-quarter", label: "This quarter" },
  { code: "last-3-months", label: "Last 3 months" },
  { code: "all-time", label: "All time" },
];

export interface ResolvedRange {
  start: string | null; // ISO date, or null for all-time
  end: string | null;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfQuarter(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}

/** Resolves a preset to concrete ISO bounds, anchored on "now". */
export function resolveRange(preset: RangePreset): ResolvedRange {
  const now = new Date();

  switch (preset) {
    case "this-month":
      return { start: startOfMonth(now).toISOString(), end: now.toISOString() };
    case "last-month": {
      const end = startOfMonth(now);
      const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "this-quarter":
      return { start: startOfQuarter(now).toISOString(), end: now.toISOString() };
    case "last-3-months": {
      const start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      return { start: start.toISOString(), end: now.toISOString() };
    }
    case "all-time":
      return { start: null, end: null };
  }
}

const STORAGE_KEY = "foundr-range-preset";

export function getStoredRangePreset(): RangePreset {
  try {
    const p = localStorage.getItem(STORAGE_KEY);
    return (RANGE_PRESETS as { code: string }[]).some((r) => r.code === p) ? (p as RangePreset) : "all-time";
  } catch {
    return "all-time";
  }
}

export function setStoredRangePreset(preset: RangePreset): void {
  try {
    localStorage.setItem(STORAGE_KEY, preset);
  } catch {
    // Storage can be unavailable (private browsing); the preset still applies for this load.
  }
}

/** Query-string fragment for a preset — empty for all-time, so callers can spread it straight into a URL. */
export function rangeQueryParams(preset: RangePreset): string {
  const { start, end } = resolveRange(preset);
  if (!start || !end) return "";
  return `&rangeStart=${encodeURIComponent(start)}&rangeEnd=${encodeURIComponent(end)}`;
}
