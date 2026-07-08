/**
 * Insight computations for the dashboard charts.
 *
 * Like metrics.ts, these are pure functions over plain data so they're
 * easy to test and reuse. Two outputs:
 *
 * - categoryBreakdown: expense totals grouped by category, biggest first.
 *   Powers the "where is my money going" bar chart.
 * - cashSeries: running cash balance at the end of each month. Powers the
 *   cash-over-time line chart (the visual version of burn/runway).
 */

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
  month: string; // "YYYY-MM"
  cash: number; // running balance at month end
}

export interface Insights {
  categoryBreakdown: CategorySlice[];
  cashSeries: CashPoint[];
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

/**
 * Build a running cash balance per month.
 * Cash moves up with investments and income, down with expenses. We walk
 * months from the earliest entry to the latest and carry the balance.
 */
export function computeCashSeries(
  entries: InsightEntry[],
  investments: InvestmentEntry[]
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

  // Sum deltas within each month.
  const byMonth = new Map<string, number>();
  for (const d of deltas) {
    const key = monthKey(d.date);
    byMonth.set(key, (byMonth.get(key) ?? 0) + d.delta);
  }

  // Walk every month from first to last so gaps still show a flat line.
  const keys = [...byMonth.keys()].sort();
  const [startY, startM] = keys[0].split("-").map(Number);
  const [endY, endM] = keys[keys.length - 1].split("-").map(Number);

  const series: CashPoint[] = [];
  let running = 0;
  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    running += byMonth.get(key) ?? 0;
    series.push({ month: key, cash: Math.round(running) });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return series;
}

export function computeInsights(
  entries: InsightEntry[],
  investments: InvestmentEntry[]
): Insights {
  return {
    categoryBreakdown: computeCategoryBreakdown(entries),
    cashSeries: computeCashSeries(entries, investments),
  };
}