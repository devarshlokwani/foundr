/**
 * Shared domain types for Foundr.
 * Kept framework-agnostic so they carry straight into the React port
 * and can be shared with the server if you move to a monorepo later.
 */

export type Tone = "good" | "warn" | "neutral";

export interface Metric {
  label: string;
  value: string;
  tone: Tone;
}

export interface Step {
  n: string;
  title: string;
  body: string;
  icon: string;
}

export interface Feature {
  icon: string;
  title: string;
  body: string;
}

export interface Plan {
  name: string;
  price: string;
  sub: string;
  tagline: string;
  features: string[];
  cta: string;
  featured: boolean;
}

export interface Faq {
  q: string;
  a: string;
}

/**
 * Shape of the response from GET /api/metrics — mirrors the server's
 * computeMetrics output. Nullable fields are null when there isn't enough
 * data yet (e.g. ROI needs investment, margin needs income).
 */
export interface DashboardMetrics {
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

/** A transaction as returned by the API (income or expense). */
export interface Transaction {
  _id: string;
  type: "expense" | "income";
  amount: number;
  category: string;
  note: string;
  date: string;
  createdAt: string;
}

/** One category's total spend, for the breakdown chart. */
export interface CategorySlice {
  category: string;
  total: number;
}

/** One month's running cash balance, for the cash chart. */
export interface CashPoint {
  month: string;
  cash: number;
}

/** Response from GET /api/insights. */
export interface DashboardInsights {
  categoryBreakdown: CategorySlice[];
  cashSeries: CashPoint[];
}

/** A unified entry from GET /api/entries. */
export interface UnifiedEntry {
  id: string;
  source: "transaction" | "investment" | "draw" | "debt";
  kind: "expense" | "revenue" | "investment" | "draw" | "debt" | "repayment";
  amount: number;
  label: string;
  note: string;
  date: string;
}

/**
 * Per-user settings, from /api/settings. Currency and the business's
 * display name live on Business instead — see below — since those are
 * per-startup facts, not account-wide ones.
 */
export interface UserSettings {
  userId: string;
  theme: "light" | "dark" | "royal" | "ocean" | "sunset" | "slate";
  gender: "male" | "female" | "non_binary" | "prefer_not_to_say" | "";
  activeBusinessId: string;
  onboarded: boolean;
}

/**
 * One of a founder's businesses/startups, from /api/businesses. Every
 * ledger entry (Expense, Investment, Draw, Debt, Category, Milestone)
 * belongs to exactly one of these, so each gets its own isolated
 * dashboard — a founder running several side hustles never sees one
 * startup's numbers bleed into another's. `currency` is per-business too:
 * one startup can track in INR while another tracks in AUD.
 */
export interface Business {
  _id: string;
  userId: string;
  name: string;
  currency: "USD" | "AUD" | "INR" | "EUR" | "GBP" | "CAD" | "SGD";
  createdAt: string;
}

/**
 * Response from GET /api/reports/margins — revenue by category, expenses
 * by category, and the full metric summary.
 */
export interface MarginsReport {
  revenue: CategorySlice[];
  expenses: CategorySlice[];
  metrics: DashboardMetrics;
}

/**
 * Response from GET /api/reports/balance-sheet. Assets always equals
 * Liabilities + Equity — see server/lib/balanceSheet.ts for the identity.
 */
export interface BalanceSheet {
  assets: { cash: number; fixedAssets: number; total: number };
  liabilities: { debt: number; total: number };
  equity: { invested: number; draws: number; retainedEarnings: number; total: number };
  balanced: boolean;
}