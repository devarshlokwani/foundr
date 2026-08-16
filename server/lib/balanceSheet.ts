/**
 * Balance sheet math, as a pure function — same style as metrics.ts.
 *
 * Assets = Liabilities + Equity, always, by construction:
 *   Assets      = Cash Remaining + Fixed Assets
 *   Liabilities = Outstanding Debt (borrowed − repaid)
 *   Equity      = Total Invested − Total Draws + Retained Earnings
 *
 * Retained Earnings = Revenue − *operating* expenses (capital purchases
 * are excluded — they became Fixed Assets instead of reducing earnings).
 * Cash Remaining already accounts for every dollar that left or entered
 * the bank (operating spend, capital spend, draws, borrowing, repayment),
 * so the identity holds exactly, not approximately.
 */

export interface BalanceSheetInputs {
  cashRemaining: number;
  fixedAssets: number;
  outstandingDebt: number;
  totalInvested: number;
  totalDraws: number;
  retainedEarnings: number;
}

export interface BalanceSheet {
  assets: { cash: number; fixedAssets: number; total: number };
  liabilities: { debt: number; total: number };
  equity: { invested: number; draws: number; retainedEarnings: number; total: number };
  balanced: boolean;
}

export function computeBalanceSheet(inputs: BalanceSheetInputs): BalanceSheet {
  const { cashRemaining, fixedAssets, outstandingDebt, totalInvested, totalDraws, retainedEarnings } = inputs;

  const assetsTotal = cashRemaining + fixedAssets;
  const liabilitiesTotal = outstandingDebt;
  const equityTotal = totalInvested - totalDraws + retainedEarnings;

  return {
    assets: {
      cash: round(cashRemaining),
      fixedAssets: round(fixedAssets),
      total: round(assetsTotal),
    },
    liabilities: {
      debt: round(outstandingDebt),
      total: round(liabilitiesTotal),
    },
    equity: {
      invested: round(totalInvested),
      draws: round(totalDraws),
      retainedEarnings: round(retainedEarnings),
      total: round(equityTotal),
    },
    // Rounding-safe equality check — the identity should hold within a cent.
    balanced: Math.abs(assetsTotal - (liabilitiesTotal + equityTotal)) < 0.01,
  };
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
