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

/** A unified entry from GET /api/entries (transaction or investment). */
export interface UnifiedEntry {
  id: string;
  source: "transaction" | "investment";
  kind: "expense" | "revenue" | "investment";
  amount: number;
  label: string;
  note: string;
  date: string;
}

/** Per-user settings, from /api/settings. */
export interface UserSettings {
  userId: string;
  currency: "USD" | "AUD" | "INR" | "EUR" | "GBP" | "CAD" | "SGD";
}