import { SubscriptionModel } from "../models/Subscription.js";
import { BusinessModel } from "../models/Business.js";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { DrawModel } from "../models/Draw.js";
import { DebtModel } from "../models/Debt.js";
import { isAdmin } from "./admin.js";

/**
 * The single source of truth for what a founder is allowed to do.
 *
 * Every limit check in the app goes through here rather than reading the
 * Subscription document directly, so "what does free actually get?" is one
 * decision in one file instead of a rule duplicated across six routes.
 *
 * How the monthly quota works, and why it works this way:
 *
 *   Entries are counted by `createdAt` falling inside the current calendar
 *   month, and deliberately WITHOUT filtering `deletedAt`. Two consequences,
 *   both intentional:
 *
 *   1. The quota resets on its own. There's no counter document to reset
 *      and no cron job to run, because the window itself moves: on the 1st,
 *      last month's entries simply fall outside the query. Nothing to drift
 *      out of sync, nothing to fail silently at midnight.
 *
 *   2. Deleting an entry does not refund quota. Counting only live entries
 *      would let a founder on the free plan add 50, delete them, and add 50
 *      more forever, which would make the limit meaningless. Quota is spent
 *      on the act of creating, not on the entry continuing to exist.
 *
 * Shopify-synced entries count against the same allowance as hand-typed
 * ones. A free founder can connect a store and watch it genuinely work,
 * then hits a real ceiling within days, which is the intended shape of the
 * free tier: a working taste of the product, not a smaller version of it.
 */

export type Plan = "free" | "premium";

export interface PlanLimits {
  /** How many businesses can exist at once. */
  businesses: number;
  /** How many ledger entries can be created per calendar month. */
  entriesPerMonth: number;
  /** How many Shopify stores can be connected at once. */
  shopifyStores: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { businesses: 2, entriesPerMonth: 50, shopifyStores: 1 },
  premium: { businesses: Infinity, entriesPerMonth: Infinity, shopifyStores: Infinity },
};

/**
 * The wire shape of a limit. `null` means unlimited, and it means that
 * deliberately: internally unlimited is `Infinity` so the arithmetic reads
 * naturally, but `JSON.stringify(Infinity)` is `null`, so the API would
 * hand clients `null` whether we intended it or not. Better to make that
 * the documented contract than to leave it as an accident of the
 * serializer that a future change could silently break.
 */
export interface WireLimits {
  businesses: number | null;
  entriesPerMonth: number | null;
  shopifyStores: number | null;
}

export interface Entitlements {
  plan: Plan;
  /**
   * True when the unlimited access comes from being an administrator
   * rather than from paying. Surfaced so the UI can say so plainly:
   * during testing it is the difference between "the bypass is working"
   * and "the plan logic is broken and letting everyone through".
   */
  isAdmin: boolean;
  limits: WireLimits;
  usage: {
    businesses: number;
    entriesThisMonth: number;
  };
  /** When the monthly entry allowance next resets (start of next month, UTC). */
  quotaResetsAt: string;
}

const toWire = (n: number): number | null => (n === Infinity ? null : n);

/** First instant of the current calendar month, which is where the quota window starts. */
function startOfMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** First instant of next month: when the allowance rolls over. */
function startOfNextMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * A founder's current plan. No subscription document means free, which is
 * what every account that predates billing will correctly resolve to.
 *
 * `past_due` deliberately still counts as premium: Stripe retries a failed
 * payment for days before giving up, and locking someone out of their own
 * financial records the moment a card expires would be a hostile way to
 * ask them to update it. When Stripe finally gives up it sends
 * `customer.subscription.deleted`, and that is what actually ends access.
 */
export async function getPlan(userId: string): Promise<Plan> {
  // Checked first so an administrator is never limited, and never needs a
  // Stripe subscription to avoid it. Every other function here reads the
  // plan through this one, so the bypass applies everywhere by
  // construction rather than by remembering to add it to each check.
  if (await isAdmin(userId)) return "premium";

  const sub = await SubscriptionModel.findOne({ userId });
  if (!sub) return "free";
  return sub.plan === "premium" ? "premium" : "free";
}

/**
 * How many ledger entries this founder has created this month, across all
 * four ledger collections and all of their businesses. The limit is
 * per-account, not per-business, so opening a second business doesn't hand
 * out a second allowance.
 */
export async function countEntriesThisMonth(userId: string): Promise<number> {
  const since = startOfMonth();
  const filter = { userId, createdAt: { $gte: since } };

  const [expenses, investments, draws, debts] = await Promise.all([
    ExpenseModel.countDocuments(filter),
    InvestmentModel.countDocuments(filter),
    DrawModel.countDocuments(filter),
    DebtModel.countDocuments(filter),
  ]);

  return expenses + investments + draws + debts;
}

export async function countBusinesses(userId: string): Promise<number> {
  return BusinessModel.countDocuments({ userId });
}

/** Everything the UI needs to show a founder where they stand. */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const [plan, admin, businesses, entriesThisMonth] = await Promise.all([
    getPlan(userId),
    isAdmin(userId),
    countBusinesses(userId),
    countEntriesThisMonth(userId),
  ]);

  const limits = PLAN_LIMITS[plan];

  return {
    plan,
    isAdmin: admin,
    limits: {
      businesses: toWire(limits.businesses),
      entriesPerMonth: toWire(limits.entriesPerMonth),
      shopifyStores: toWire(limits.shopifyStores),
    },
    usage: { businesses, entriesThisMonth },
    quotaResetsAt: startOfNextMonth().toISOString(),
  };
}

/**
 * The result of a limit check. `ok: false` carries copy that is safe to
 * show a founder directly, so routes don't each invent their own wording
 * for the same refusal.
 */
export type LimitCheck = { ok: true } | { ok: false; reason: string; limit: number; used: number };

/**
 * Can this founder create `count` more entries right now?
 *
 * `count` is there for bulk import, which has to be all-or-nothing: half
 * an import landing and the rest silently vanishing would be worse than a
 * clear refusal up front.
 */
export async function checkEntryQuota(userId: string, count = 1): Promise<LimitCheck> {
  const plan = await getPlan(userId);
  const limit = PLAN_LIMITS[plan].entriesPerMonth;
  if (limit === Infinity) return { ok: true };

  const used = await countEntriesThisMonth(userId);
  if (used + count <= limit) return { ok: true };

  const remaining = Math.max(0, limit - used);
  const reason =
    count === 1
      ? `You've used all ${limit} entries on the free plan this month. Your allowance resets on the 1st, or upgrade for unlimited entries.`
      : `That import needs ${count} entries but you have ${remaining} left this month on the free plan. Your allowance resets on the 1st, or upgrade for unlimited entries.`;

  return { ok: false, reason, limit, used };
}

/**
 * How many more entries this founder can create this month. `Infinity` on
 * premium. Used by recurring-rule materialization, which needs to know how
 * many of a backlog it's allowed to create rather than just whether it can
 * create one.
 */
export async function getRemainingEntryQuota(userId: string): Promise<number> {
  const plan = await getPlan(userId);
  const limit = PLAN_LIMITS[plan].entriesPerMonth;
  if (limit === Infinity) return Infinity;

  const used = await countEntriesThisMonth(userId);
  return Math.max(0, limit - used);
}

export async function checkBusinessLimit(userId: string): Promise<LimitCheck> {
  const plan = await getPlan(userId);
  const limit = PLAN_LIMITS[plan].businesses;
  if (limit === Infinity) return { ok: true };

  const used = await countBusinesses(userId);
  if (used < limit) return { ok: true };

  return {
    ok: false,
    reason: `The free plan covers ${limit} startups. Upgrade to track as many as you like.`,
    limit,
    used,
  };
}
