/**
 * Insight computations for the dashboard charts.
 *
 * Like metrics.ts, these are pure functions over plain data so they're
 * easy to test and reuse. Three outputs:
 *
 * - categoryBreakdown: expense totals grouped by category, biggest first.
 *   Powers the "where is my money going" bar chart.
 * - cashSeries: running cash balance per bucket. Powers the cash-over-time
 *   line chart (the visual version of burn/runway).
 * - monthlySeries: per-bucket income/expense totals, not cumulative.
 *   Powers the Trends tab's revenue-vs-expense and month-over-month charts.
 *
 * Both series accept a `granularity` — "month" (the default, and the only
 * option before this existed), "biweekly" (a fixed 14-day window from the
 * earliest entry, not calendar-aligned), or "day". The bucket `key` is no
 * longer necessarily a month once granularity varies, which is why the
 * field is called `key`, not `month`.
 */

export type Granularity = "day" | "biweekly" | "month";

export interface InsightEntry {
  type: "expense" | "income";
  amount: number;
  category: string;
  date: Date | string;
}

export interface InvestmentEntry {
  amount: number;
  date: Date | string;
}

export interface CategorySlice {
  category: string;
  total: number;
}

export interface CashPoint {
  key: string; // "YYYY-MM" for month, "YYYY-MM-DD" (bucket start) for day/biweekly
  cash: number; // running balance at the end of this bucket
}

export interface MonthlyPoint {
  key: string; // "YYYY-MM" for month, "YYYY-MM-DD" (bucket start) for day/biweekly
  income: number; // this bucket's income, not cumulative
  expenses: number; // this bucket's expenses, not cumulative
}

export interface Insights {
  categoryBreakdown: CategorySlice[];
  cashSeries: CashPoint[];
  monthlySeries: MonthlyPoint[];
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Bucket {
  key: string;
  start: Date;
  end: Date; // exclusive
}

/**
 * Every bucket from the earliest to the latest date, in order, so gaps
 * with no activity still show as a flat point rather than a skipped one.
 */
function buildBuckets(dates: Date[], granularity: Granularity): Bucket[] {
  if (dates.length === 0) return [];
  const first = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
  const last = dates.reduce((max, d) => (d > max ? d : max), dates[0]);

  if (granularity === "month") {
    const buckets: Bucket[] = [];
    let y = first.getFullYear();
    let m = first.getMonth();
    const endY = last.getFullYear();
    const endM = last.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 1);
      buckets.push({ key: monthKey(start), start, end });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return buckets;
  }

  const stepDays = granularity === "day" ? 1 : 14;
  const buckets: Bucket[] = [];
  const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  let cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  while (cursor <= lastDay) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(end.getDate() + stepDays);
    buckets.push({ key: dayKey(start), start, end });
    cursor = end;
  }
  return buckets;
}

/**
 * Which bucket a date falls into, computed directly (not by searching the
 * bucket list) — for day/biweekly this indexes off `anchor` (the earliest
 * date across the same series buildBuckets was called with), so the two
 * stay in lockstep and every key matches one of buildBuckets' buckets.
 */
function bucketKeyFor(date: Date, granularity: Granularity, anchor: Date): string {
  if (granularity === "month") return monthKey(date);

  const stepDays = granularity === "day" ? 1 : 14;
  const anchorDay = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const thisDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((thisDay.getTime() - anchorDay.getTime()) / 86400000);
  const bucketIndex = Math.floor(diffDays / stepDays);
  const bucketStart = new Date(anchorDay);
  bucketStart.setDate(bucketStart.getDate() + bucketIndex * stepDays);
  return dayKey(bucketStart);
}

function earliest(dates: Date[]): Date {
  return dates.reduce((min, d) => (d < min ? d : min), dates[0]);
}

/** Group expenses by category, largest total first. */
export function computeCategoryBreakdown(entries: InsightEntry[]): CategorySlice[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.type !== "expense") continue;
    const key = e.category || "Uncategorised";
    totals.set(key, (totals.get(key) ?? 0) + e.amount);
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total);
}

/** Group revenue by category, largest total first. Mirrors computeCategoryBreakdown. */
export function computeRevenueBreakdown(entries: InsightEntry[]): CategorySlice[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.type !== "income") continue;
    const key = e.category || "Uncategorised";
    totals.set(key, (totals.get(key) ?? 0) + e.amount);
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Build a running cash balance per bucket.
 * Cash moves up with investments and income, down with expenses.
 */
export function computeCashSeries(
  entries: InsightEntry[],
  investments: InvestmentEntry[],
  granularity: Granularity = "month"
): CashPoint[] {
  type Delta = { date: Date; delta: number };
  const deltas: Delta[] = [];

  for (const e of entries) {
    deltas.push({ date: new Date(e.date), delta: e.type === "income" ? e.amount : -e.amount });
  }
  for (const inv of investments) {
    deltas.push({ date: new Date(inv.date), delta: inv.amount });
  }

  if (deltas.length === 0) return [];

  const dates = deltas.map((d) => d.date);
  const anchor = earliest(dates);

  const sums = new Map<string, number>();
  for (const d of deltas) {
    const key = bucketKeyFor(d.date, granularity, anchor);
    sums.set(key, (sums.get(key) ?? 0) + d.delta);
  }

  const buckets = buildBuckets(dates, granularity);
  const series: CashPoint[] = [];
  let running = 0;
  for (const b of buckets) {
    running += sums.get(b.key) ?? 0;
    series.push({ key: b.key, cash: Math.round(running) });
  }
  return series;
}

/**
 * Per-bucket income and expense totals — unlike computeCashSeries, these
 * are kept separate and not netted into a running balance, so a revenue-
 * vs-expense trend chart and a month-over-month view can both read off
 * this one series instead of needing their own aggregation.
 */
export function computeMonthlySeries(entries: InsightEntry[], granularity: Granularity = "month"): MonthlyPoint[] {
  if (entries.length === 0) return [];

  const dates = entries.map((e) => new Date(e.date));
  const anchor = earliest(dates);

  const sums = new Map<string, { income: number; expenses: number }>();
  for (const e of entries) {
    const key = bucketKeyFor(new Date(e.date), granularity, anchor);
    const bucket = sums.get(key) ?? { income: 0, expenses: 0 };
    if (e.type === "income") bucket.income += e.amount;
    else bucket.expenses += e.amount;
    sums.set(key, bucket);
  }

  const buckets = buildBuckets(dates, granularity);
  return buckets.map((b) => {
    const bucket = sums.get(b.key) ?? { income: 0, expenses: 0 };
    return { key: b.key, income: Math.round(bucket.income), expenses: Math.round(bucket.expenses) };
  });
}

/**
 * `period`, when given, scopes categoryBreakdown and monthlySeries to that
 * window (both are flow figures — "what happened in this period"). The
 * running-balance cash chart deliberately stays all-time regardless — a
 * balance chart needs full history to mean anything, same reasoning as
 * why the Balance Sheet report is never date-filtered. `granularity`
 * applies to both series independently of `period`.
 */
export function computeInsights(
  entries: InsightEntry[],
  investments: InvestmentEntry[],
  period: { start: Date; end: Date } | null = null,
  granularity: Granularity = "month"
): Insights {
  const periodEntries = period
    ? entries.filter((e) => {
        const d = new Date(e.date);
        return d >= period.start && d <= period.end;
      })
    : entries;

  return {
    categoryBreakdown: computeCategoryBreakdown(periodEntries),
    cashSeries: computeCashSeries(entries, investments, granularity),
    monthlySeries: computeMonthlySeries(periodEntries, granularity),
  };
}
