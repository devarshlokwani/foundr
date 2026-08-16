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
 */

export interface Entry {
  type: "expense" | "income";
  amount: number;
  date: Date | string;
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
 * since investments, draws, and debt each live in their own collection.
 */
export function computeMetrics(
  entries: Entry[],
  totalInvested: number,
  totalDraws = 0,
  netBorrowed = 0
): Metrics {
  let totalExpenses = 0;
  let totalIncome = 0;
  const expenseDates: Date[] = [];

  for (const e of entries) {
    const amount = e.amount;
    if (e.type === "expense") {
      totalExpenses += amount;
      expenseDates.push(new Date(e.date));
    } else {
      totalIncome += amount;
    }
  }

  // Average monthly burn = net cash out, spread over the period observed.
  const netOut = Math.max(0, totalExpenses - totalIncome);
  const months = monthsSpanned(expenseDates);
  const monthlyBurn = netOut / months;

  // Cash remaining = what was put in, minus net spent, minus what the
  // founder drew out, plus what's currently borrowed (net of repayments).
  const cashRemaining = totalInvested + totalIncome - totalExpenses - totalDraws + netBorrowed;

  // Runway = months of cash left at current burn. Null if not burning.
  const runwayMonths = monthlyBurn > 0 ? cashRemaining / monthlyBurn : null;

  const netPosition = totalIncome - totalInvested;
  const personalRoi = totalInvested > 0 ? (totalIncome - totalInvested) / totalInvested : null;
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