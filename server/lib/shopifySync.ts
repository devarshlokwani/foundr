import { ShopifyConnectionModel } from "../models/ShopifyConnection.js";
import { ExpenseModel } from "../models/Expense.js";
import { decryptToken } from "./tokenCrypto.js";
import { getRemainingEntryQuota } from "./entitlements.js";
import {
  fetchOrdersPage,
  countOrders,
  isRevenueOrder,
  orderAmount,
  orderExternalId,
  ShopifyError,
  type ShopifyOrder,
} from "./shopify.js";

/**
 * Turns Shopify orders into revenue entries in a founder's ledger.
 *
 * Two rules drive the whole design:
 *
 *   Never double-count. Every synced entry carries the Shopify order ID in
 *   `externalId`, guarded by a unique index (see models/Expense.ts). A
 *   re-sync of the same order is skipped rather than added again, because
 *   silently inflating revenue would corrupt every metric built on top of
 *   it: runway, margin, ROI.
 *
 *   Never strand the backlog. Syncing runs newest-first so a founder whose
 *   allowance covers only part of their store gets the orders that reflect
 *   how the business is doing now. That leaves older orders unsynced, so
 *   the connection remembers both edges of what it has pulled: the newest
 *   (to fetch new sales going forward) and the oldest (to walk further back
 *   when there's allowance for it). Without the second watermark, an
 *   upgrade would unlock nothing, because forward-only syncing would never
 *   look back at the orders the limit originally stopped.
 */

/** Shopify's own cap per request; also our page size, to minimise round trips. */
const PAGE_SIZE = 250;

/** Where synced revenue lands, so it groups as one line in reports. */
export const SHOPIFY_CATEGORY = "Shopify sales";

export interface SyncResult {
  synced: number;
  /** Orders already in the ledger from a previous sync. */
  duplicates: number;
  /** Orders skipped as not-revenue (cancelled, refunded, voided). */
  skipped: number;
  /** True when the monthly entry allowance stopped the sync before the store ran out. */
  quotaReached: boolean;
  /** Orders still unsynced, for the "here's what you're missing" prompt. */
  remaining: { count: number; exact: boolean } | null;
  currencyCode: string | null;
}

interface OrderBatch {
  orders: ShopifyOrder[];
  hasNextPage: boolean;
  endCursor: string | null;
}

/**
 * Walks pages in one direction, collecting revenue orders until it has
 * `budget` of them or the store runs out.
 */
async function collectOrders(
  shopDomain: string,
  token: string,
  budget: number,
  window: { since?: Date | null; before?: Date | null }
): Promise<{ collected: ShopifyOrder[]; skipped: number; storeExhausted: boolean }> {
  const collected: ShopifyOrder[] = [];
  let skipped = 0;
  let after: string | null = null;
  let storeExhausted = false;

  while (collected.length < budget) {
    const page: OrderBatch = await fetchOrdersPage(shopDomain, token, {
      pageSize: PAGE_SIZE,
      after,
      ...window,
    });

    for (const order of page.orders) {
      if (!isRevenueOrder(order)) {
        skipped++;
        continue;
      }
      collected.push(order);
      if (collected.length >= budget) break;
    }

    if (!page.hasNextPage) {
      storeExhausted = true;
      break;
    }
    after = page.endCursor;
    if (!after) {
      storeExhausted = true;
      break;
    }
  }

  return { collected, skipped, storeExhausted };
}

/**
 * Writes orders as income entries, skipping any already present.
 *
 * The pre-check against existing IDs keeps the common case quiet, and the
 * unique index behind it is what actually guarantees correctness if two
 * syncs ever overlap: the duplicate insert fails rather than double-counting.
 */
async function writeOrders(
  userId: string,
  businessId: string,
  orders: ShopifyOrder[]
): Promise<{ inserted: number; duplicates: number }> {
  if (orders.length === 0) return { inserted: 0, duplicates: 0 };

  const ids = orders.map(orderExternalId);
  const existing = await ExpenseModel.find(
    { businessId, externalId: { $in: ids } },
    { externalId: 1 }
  ).lean();
  const seen = new Set(existing.map((e) => e.externalId));

  const fresh = orders.filter((o) => !seen.has(orderExternalId(o)));
  if (fresh.length === 0) return { inserted: 0, duplicates: orders.length };

  const docs = fresh.map((order) => ({
    userId,
    businessId,
    type: "income" as const,
    amount: orderAmount(order),
    category: SHOPIFY_CATEGORY,
    note: `Shopify order ${order.name}`,
    date: new Date(order.createdAt),
    isCapital: false,
    deletedAt: null,
    source: "shopify" as const,
    externalId: orderExternalId(order),
  }));

  try {
    await ExpenseModel.insertMany(docs, { ordered: false });
    return { inserted: docs.length, duplicates: orders.length - fresh.length };
  } catch (err) {
    // ordered:false means the good rows still landed; a duplicate-key error
    // here is the index doing its job on a concurrent sync, not a failure.
    const e = err as { code?: number; insertedDocs?: unknown[]; writeErrors?: unknown[] };
    if (e.code === 11000 || e.writeErrors) {
      const inserted = Array.isArray(e.insertedDocs) ? e.insertedDocs.length : 0;
      return { inserted, duplicates: orders.length - inserted };
    }
    throw err;
  }
}

/**
 * Pulls a business's Shopify orders into its ledger, bounded by the
 * founder's remaining monthly entry allowance.
 */
export async function syncShopifyOrders(userId: string, businessId: string): Promise<SyncResult> {
  const conn = await ShopifyConnectionModel.findOne({ userId, businessId });
  if (!conn) throw new ShopifyError("No Shopify store is connected to this startup.");

  const token = decryptToken(conn.accessToken);
  const budget = await getRemainingEntryQuota(userId);

  const result: SyncResult = {
    synced: 0,
    duplicates: 0,
    skipped: 0,
    quotaReached: false,
    remaining: null,
    currencyCode: null,
  };

  if (budget <= 0) {
    result.quotaReached = true;
    result.remaining = await safeCount(conn.shopDomain, token, { before: conn.oldestOrderSynced });
    return result;
  }

  try {
    let left = budget === Infinity ? Number.MAX_SAFE_INTEGER : budget;
    let newest: Date | null = conn.ordersSyncedThrough ?? null;
    let oldest: Date | null = conn.oldestOrderSynced ?? null;

    // Forward pass: sales made since the last sync. On a first connect both
    // watermarks are null, so this single pass walks the whole store
    // newest-first and no backfill pass is needed.
    const forward = await collectOrders(conn.shopDomain, token, left, { since: conn.ordersSyncedThrough });
    result.skipped += forward.skipped;

    if (forward.collected.length > 0) {
      const written = await writeOrders(userId, businessId, forward.collected);
      result.synced += written.inserted;
      result.duplicates += written.duplicates;
      left -= forward.collected.length;

      const dates = forward.collected.map((o) => new Date(o.createdAt).getTime());
      const batchNewest = new Date(Math.max(...dates));
      const batchOldest = new Date(Math.min(...dates));
      if (!newest || batchNewest > newest) newest = batchNewest;
      if (!oldest || batchOldest < oldest) oldest = batchOldest;
      result.currencyCode = forward.collected[0].totalPriceSet?.shopMoney?.currencyCode ?? null;
    }

    // Backfill pass: older orders a previous run's allowance couldn't reach.
    // Only meaningful once a first sync has set the oldest watermark.
    if (left > 0 && oldest) {
      const back = await collectOrders(conn.shopDomain, token, left, { before: oldest });
      result.skipped += back.skipped;

      if (back.collected.length > 0) {
        const written = await writeOrders(userId, businessId, back.collected);
        result.synced += written.inserted;
        result.duplicates += written.duplicates;
        left -= back.collected.length;

        const oldestInBatch = new Date(Math.min(...back.collected.map((o) => new Date(o.createdAt).getTime())));
        if (oldestInBatch < oldest) oldest = oldestInBatch;
        result.currencyCode ??= back.collected[0].totalPriceSet?.shopMoney?.currencyCode ?? null;
      }
    }

    result.quotaReached = budget !== Infinity && left <= 0;

    conn.ordersSyncedThrough = newest;
    conn.oldestOrderSynced = oldest;
    conn.lastSyncedAt = new Date();
    conn.totalOrdersSynced += result.synced;
    conn.status = "active";
    conn.lastError = "";
    await conn.save();

    // Only worth asking Shopify what's left when something actually stopped
    // us; if the store ran dry there is nothing to report.
    if (result.quotaReached) {
      result.remaining = await safeCount(conn.shopDomain, token, { before: oldest });
    }

    return result;
  } catch (err) {
    conn.status = "error";
    conn.lastError = err instanceof Error ? err.message : "Sync failed.";
    conn.lastSyncedAt = new Date();
    await conn.save();
    throw err;
  }
}

/**
 * The unsynced-orders count is a nicety for the upgrade prompt, never a
 * reason to fail a sync that already succeeded, so its errors are swallowed.
 */
async function safeCount(
  shopDomain: string,
  token: string,
  window: { before?: Date | null }
): Promise<{ count: number; exact: boolean } | null> {
  if (!window.before) return null;
  try {
    const counted = await countOrders(shopDomain, token, window);
    return counted.count > 0 ? counted : null;
  } catch {
    return null;
  }
}
