import { apiGet, apiPost, apiDelete } from "./api";
import type { Entitlements } from "./entitlements";

/**
 * Shopify connection and sync, scoped to one business.
 *
 * The access token travels one way only: it is sent on connect and never
 * comes back from the server, so nothing here ever holds or displays it.
 * Everything the UI shows about a connection is derived from the store
 * name, sync timestamps, and counts.
 */

export interface ShopifyConnection {
  connected: boolean;
  shopDomain?: string;
  shopName?: string;
  /** False when the app only has read_orders, which Shopify limits to the last 60 days. */
  hasFullHistoryScope?: boolean;
  lastSyncedAt?: string | null;
  totalOrdersSynced?: number;
  status?: "active" | "error";
  lastError?: string;
  /** Present on connect when the store's currency differs from the business's. */
  currencyMismatch?: string | null;
}

export interface SyncResult {
  synced: number;
  duplicates: number;
  skipped: number;
  /** True when the monthly entry allowance stopped the sync before the store ran out. */
  quotaReached: boolean;
  remaining: { count: number; exact: boolean } | null;
  currencyCode: string | null;
  connection: ShopifyConnection;
  entitlements: Entitlements;
}

export async function fetchShopifyConnection(businessId: string): Promise<ShopifyConnection> {
  return apiGet<ShopifyConnection>(`/shopify?businessId=${businessId}`);
}

export async function connectShopify(
  businessId: string,
  shopDomain: string,
  accessToken: string
): Promise<ShopifyConnection> {
  return apiPost<ShopifyConnection>(`/shopify/connect?businessId=${businessId}`, { shopDomain, accessToken });
}

export async function syncShopify(businessId: string): Promise<SyncResult> {
  return apiPost<SyncResult>(`/shopify/sync?businessId=${businessId}`, {});
}

export async function disconnectShopify(businessId: string): Promise<{ ok: boolean; keptEntries: number }> {
  return apiDelete<{ ok: boolean; keptEntries: number }>(`/shopify?businessId=${businessId}`);
}

/** "5 minutes ago" style, matching how the rest of the app talks about recency. */
export function formatSyncedAt(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
