import { apiGet } from "./api";

/**
 * What the founder's plan allows, and how much of it they've used.
 *
 * Read-only as far as the client is concerned: this exists so the UI can
 * show someone where they stand before they hit a wall, never to decide
 * whether an action is permitted. The server enforces every limit inside
 * the routes themselves, because a check that only lives in the browser is
 * a suggestion, not a limit.
 *
 * A `null` limit means unlimited. That is the documented contract rather
 * than an accident: unlimited is Infinity on the server, and JSON has no
 * way to represent it.
 */

export type Plan = "free" | "premium";

export interface Entitlements {
  plan: Plan;
  /**
   * True when the unlimited access comes from being an administrator
   * rather than from paying, so the UI can say which it is instead of
   * showing someone a "Premium" badge they never bought.
   */
  isAdmin: boolean;
  limits: {
    businesses: number | null;
    entriesPerMonth: number | null;
    shopifyStores: number | null;
  };
  usage: {
    businesses: number;
    entriesThisMonth: number;
  };
  quotaResetsAt: string;
}

export async function fetchEntitlements(): Promise<Entitlements> {
  return apiGet<Entitlements>("/entitlements");
}

/** Entries left this month, or null when the plan is unlimited. */
export function entriesRemaining(e: Entitlements): number | null {
  if (e.limits.entriesPerMonth === null) return null;
  return Math.max(0, e.limits.entriesPerMonth - e.usage.entriesThisMonth);
}

/** "1 October" style, for telling someone when their allowance comes back. */
export function formatQuotaReset(e: Entitlements): string {
  return new Date(e.quotaResetsAt).toLocaleDateString(undefined, { day: "numeric", month: "long" });
}
