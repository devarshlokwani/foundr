/**
 * Foundr's finance math, as pure functions.
 *
 * Kept free of database or Express types on purpose: these take plain
 * numbers and arrays, so they're easy to test and can be reused on the
 * frontend (or shared in a monorepo) without dragging server code along.
 *
 * Definitions, in plain terms:
 * - Burn rate: average monthly net cash going out (expenses minus income).
 * - Runway: how many months of cash remain at the current burn.
 * - Net position: total invested minus what's come back as income.
 * - Personal ROI: income earned relative to the founder's own investment.
 * - Gross margin: profit as a share of revenue.
 *
 * totalDraws and netBorrowed (borrowed minus repaid) only affect
 * cashRemaining (and so runway) — deliberately not folded into burn,
 * netPosition, ROI, or gross margin, so what "burn rate" has always meant
 * doesn't change now that draws and debt exist.
 *
 * Date range filtering (the optional `period` argument) only scopes the
 * *flow* figures — totalExpenses, totalIncome, monthlyBurn, grossMargin —
 * to the selected window. The *cumulative* figures — cashRemaining,
 * totalInvested, netPosition, personalRoi — always reflect the running
 * position as of the end of that window (or right now, with no period),
 * not just what moved during it: "what was my cash position at the end
 * of last month" is a meaningful question, "last month's isolated cash
 * movement" mostly isn't. `entries` (and the totalInvested/totalDraws/
 * netBorrowed the caller passes in) are expected to already be limited to
 * `date <= period.end` — this function only needs `period.start` to know
 * where the flow window begins within that set.
 */

export interface Entry {
  type: "expense" | "income";
  amount: number;
  date: Date | string;
}

export interface Period {
  start: Date;
  end: Date;
}

export interface Metrics {
  totalExpenses: number;
  totalIncome: number;
  totalInvested: number;
  cashRemaining: number;
  monthlyBurn: number;
  runwayMonths: number | null;
  netPosition: number;
  personalRoi: number | null;
  grossMargin: number | null;
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;

function monthsSpanned(dates: Date[]): number {
  if (dates.length < 2) return 1;
  const times = dates.map((d) => d.getTime());
  const span = Math.max(...times) - Math.min(...times);
  return Math.max(1, span / MS_PER_MONTH);
}

/**
 * Compute all dashboard metrics from a founder's entries and investments.
 * `totalInvested`, `totalDraws`, and `netBorrowed` are passed in separately
 * since investments, draws, and debt each live in their own collection —
 * all three (and `entries`) should already be limited to `date <= period.end`
 * by the caller when a period is given. With no `period` (the default),
 * behaviour is exactly what it was before date ranges existed: every
 * figure is all-time.
 */
export function computeMetrics(
  entries: Entry[],
  totalInvested: number,
  totalDraws = 0,
  netBorrowed = 0,
  period: Period | null = null
): Metrics {
  // Cumulative totals — from every entry the caller passed in (already
  // capped at the period's end, if any), regardless of the period's start.
  let allTotalExpenses = 0;
  let allTotalIncome = 0;
  for (const e of entries) {
    if (e.type === "expense") allTotalExpenses += e.amount;
    else allTotalIncome += e.amount;
  }

  // Flow totals — scoped to the period's start, if given.
  const periodEntries = period ? entries.filter((e) => new Date(e.date) >= period.start) : entries;
  let totalExpenses = 0;
  let totalIncome = 0;
  const expenseDates: Date[] = [];
  for (const e of periodEntries) {
    if (e.type === "expense") {
      totalExpenses += e.amount;
      expenseDates.push(new Date(e.date));
    } else {
      totalIncome += e.amount;
    }
  }

  // Average monthly burn = net cash out, spread over the period observed —
  // the calendar span of the selected range itself when one's given (so
  // "this month" divides by ~1, not by however many days had entries),
  // otherwise the span between the earliest and latest expense, as before.
  const netOut = Math.max(0, totalExpenses - totalIncome);
  const months = period ? Math.max(1, (period.end.getTime() - period.start.getTime()) / MS_PER_MONTH) : monthsSpanned(expenseDates);
  const monthlyBurn = netOut / months;

  // Cash remaining = what was put in, minus net spent, minus what the
  // founder drew out, plus what's currently borrowed (net of repayments).
  // Cumulative — as of the period's end (or now), not scoped to its start.
  const cashRemaining = totalInvested + allTotalIncome - allTotalExpenses - totalDraws + netBorrowed;

  // Runway = months of cash left at current burn. Null if not burning.
  const runwayMonths = monthlyBurn > 0 ? cashRemaining / monthlyBurn : null;

  const netPosition = allTotalIncome - totalInvested;
  const personalRoi = totalInvested > 0 ? (allTotalIncome - totalInvested) / totalInvested : null;
  const grossMargin = totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : null;

  return {
    totalExpenses: round(totalExpenses),
    totalIncome: round(totalIncome),
    totalInvested: round(totalInvested),
    cashRemaining: round(cashRemaining),
    monthlyBurn: round(monthlyBurn),
    runwayMonths: runwayMonths === null ? null : round(runwayMonths, 1),
    netPosition: round(netPosition),
    personalRoi: personalRoi === null ? null : round(personalRoi, 3),
    grossMargin: grossMargin === null ? null : round(grossMargin, 3),
  };
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}