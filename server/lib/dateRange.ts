/**
 * Shared parsing for the `?rangeStart=&rangeEnd=` query params accepted by
 * /api/metrics, /api/insights, and /api/reports/margins (never
 * /api/reports/balance-sheet — that report is always a live, all-time
 * snapshot, same reasoning documented in lib/metrics.ts).
 *
 * Both params are optional and go together: `rangeEnd` alone caps
 * cumulative figures "as of" that date; `rangeStart` additionally scopes
 * flow figures to the window between the two. Malformed dates are
 * ignored rather than allowed to silently produce NaN through the math.
 */

export interface ParsedRange {
  /** The date to treat as "now" for cumulative figures — real "now" if no rangeEnd was given. */
  rangeEnd: Date;
  /** Non-null only when a valid rangeStart was given — what computeMetrics/computeInsights use to scope flow figures. */
  period: { start: Date; end: Date } | null;
  /** A Mongo filter fragment: `{}` if no rangeEnd was given (no-op), otherwise caps queries at rangeEnd. */
  dateFilter: Record<string, unknown>;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function parseRangeQuery(query: Record<string, unknown>): ParsedRange {
  const parsedEnd = parseDate(query.rangeEnd);
  const parsedStart = parseDate(query.rangeStart);
  const rangeEnd = parsedEnd ?? new Date();

  return {
    rangeEnd,
    period: parsedStart ? { start: parsedStart, end: rangeEnd } : null,
    dateFilter: parsedEnd ? { date: { $lte: rangeEnd } } : {},
  };
}
