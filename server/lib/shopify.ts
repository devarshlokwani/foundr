/**
 * Thin client for Shopify's Admin GraphQL API.
 *
 * Custom-app model: the merchant creates an app inside their own Shopify
 * admin, grants it order-read access, and pastes the resulting Admin API
 * token into Foundr. No OAuth dance and no Shopify app review, which is
 * what makes this shippable now rather than after a review cycle.
 *
 * Two Shopify behaviours shape everything downstream:
 *
 *   - `read_orders` alone only reaches orders from the last 60 days.
 *     Full history needs `read_all_orders`, which the merchant grants
 *     separately. We detect which one we actually got rather than assuming,
 *     so the UI can tell the founder the truth about what it can see.
 *
 *   - Money comes back as a string, not a number, because floats lose
 *     cents. It is parsed exactly once, here, at the boundary.
 */

const API_VERSION = "2026-07";

export interface ShopifyOrder {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
}

export interface ShopInfo {
  shopName: string;
  currencyCode: string;
  hasFullHistoryScope: boolean;
}

/**
 * An error safe to show a founder. Shopify's raw messages leak internals
 * and sometimes the token itself, so every failure is narrowed to
 * something explanatory but harmless before it leaves this module.
 */
export class ShopifyError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ShopifyError";
  }
}

/**
 * Accepts what a founder is likely to paste: "mystore",
 * "mystore.myshopify.com", or the full admin URL, and returns the canonical
 * domain. Getting this wrong is the most common setup failure, so it is
 * handled here rather than by asking them to format it correctly.
 */
export function normalizeShopDomain(input: string): string {
  let domain = String(input || "").trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain) throw new ShopifyError("Enter your Shopify store domain.");
  if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw new ShopifyError("That doesn't look like a Shopify store domain. It should end in .myshopify.com");
  }
  return domain;
}

async function shopifyGraphQL<T>(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new ShopifyError("Couldn't reach Shopify. Check the store domain and try again.");
  }

  if (res.status === 401 || res.status === 403) {
    throw new ShopifyError("Shopify rejected that access token. Check it was copied in full and still exists.", res.status);
  }
  if (res.status === 404) {
    throw new ShopifyError("No Shopify store found at that domain.", 404);
  }
  if (res.status === 429) {
    throw new ShopifyError("Shopify is rate limiting this store. Wait a minute and sync again.", 429);
  }
  if (!res.ok) {
    throw new ShopifyError(`Shopify returned an unexpected error (${res.status}). Try again shortly.`, res.status);
  }

  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };

  if (body.errors?.length) {
    const message = body.errors[0].message || "";
    // Distinguishing the scope failure matters: it is the one error the
    // founder can actually fix, by granting the app order access.
    if (/access denied|not approved|scope/i.test(message)) {
      throw new ShopifyError("This Shopify app doesn't have permission to read orders. Add the read_orders scope and reinstall it.");
    }
    throw new ShopifyError("Shopify couldn't complete that request. Try again shortly.");
  }
  if (!body.data) throw new ShopifyError("Shopify returned an empty response.");

  return body.data;
}

/**
 * Confirms the token works and reports what it can actually see. Called on
 * connect so setup problems surface immediately, rather than as a sync
 * that mysteriously returns nothing.
 */
export async function verifyConnection(shopDomain: string, accessToken: string): Promise<ShopInfo> {
  const data = await shopifyGraphQL<{
    shop: { name: string; currencyCode: string };
  }>(shopDomain, accessToken, `query { shop { name currencyCode } }`);

  return {
    shopName: data.shop.name,
    currencyCode: data.shop.currencyCode,
    hasFullHistoryScope: await detectFullHistoryScope(shopDomain, accessToken),
  };
}

/**
 * Best-effort check for `read_all_orders`. Treated as optional: if the
 * scopes query is unavailable we assume the narrower 60-day access, since
 * claiming more history than we can reach would produce a sync that
 * silently returns less than the UI promised.
 */
async function detectFullHistoryScope(shopDomain: string, accessToken: string): Promise<boolean> {
  try {
    const data = await shopifyGraphQL<{
      currentAppInstallation: { accessScopes: { handle: string }[] };
    }>(shopDomain, accessToken, `query { currentAppInstallation { accessScopes { handle } } }`);

    return data.currentAppInstallation.accessScopes.some((s) => s.handle === "read_all_orders");
  } catch {
    return false;
  }
}

const ORDER_FIELDS = `
  id
  name
  createdAt
  cancelledAt
  displayFinancialStatus
  totalPriceSet { shopMoney { amount currencyCode } }
`;

/**
 * One page of orders, newest first.
 *
 * Newest-first is deliberate and is what makes the free tier work: when a
 * founder's allowance only covers part of their store, the orders they get
 * are the recent ones that reflect how the business is doing now, not the
 * oldest ones from whenever they opened.
 */
export async function fetchOrdersPage(
  shopDomain: string,
  accessToken: string,
  opts: { pageSize?: number; after?: string | null; since?: Date | null; before?: Date | null } = {}
): Promise<{ orders: ShopifyOrder[]; hasNextPage: boolean; endCursor: string | null }> {
  const pageSize = Math.min(opts.pageSize ?? 50, 250);
  const clauses: string[] = [];
  if (opts.since) clauses.push(`created_at:>'${opts.since.toISOString()}'`);
  if (opts.before) clauses.push(`created_at:<'${opts.before.toISOString()}'`);
  const filter = clauses.length ? clauses.join(" AND ") : null;

  const data = await shopifyGraphQL<{
    orders: {
      edges: { cursor: string; node: ShopifyOrder }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(
    shopDomain,
    accessToken,
    `query Orders($pageSize: Int!, $after: String, $filter: String) {
      orders(first: $pageSize, after: $after, query: $filter, sortKey: CREATED_AT, reverse: true) {
        edges { cursor node { ${ORDER_FIELDS} } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { pageSize, after: opts.after ?? null, filter }
  );

  return {
    orders: data.orders.edges.map((e) => e.node),
    hasNextPage: data.orders.pageInfo.hasNextPage,
    endCursor: data.orders.pageInfo.endCursor,
  };
}

/**
 * How many orders exist, for telling a founder what they haven't pulled in
 * yet. `limit: null` asks Shopify not to stop counting early; precision
 * can still come back as an estimate on very large stores, which the UI
 * words as "about" rather than pretending to an exact figure.
 */
export async function countOrders(
  shopDomain: string,
  accessToken: string,
  window: { since?: Date | null; before?: Date | null } = {}
): Promise<{ count: number; exact: boolean }> {
  const clauses: string[] = [];
  if (window.since) clauses.push(`created_at:>'${window.since.toISOString()}'`);
  if (window.before) clauses.push(`created_at:<'${window.before.toISOString()}'`);

  const data = await shopifyGraphQL<{ ordersCount: { count: number; precision: string } }>(
    shopDomain,
    accessToken,
    `query OrdersCount($filter: String) { ordersCount(limit: null, query: $filter) { count precision } }`,
    { filter: clauses.length ? clauses.join(" AND ") : null }
  );

  return { count: data.ordersCount.count, exact: data.ordersCount.precision === "EXACT" };
}

/**
 * Whether an order should become a revenue entry.
 *
 * Cancelled and fully refunded orders are excluded: they are not money the
 * business kept, and counting them would overstate revenue in exactly the
 * metrics (runway, margin) a founder is relying on to make decisions.
 */
export function isRevenueOrder(order: ShopifyOrder): boolean {
  if (order.cancelledAt) return false;
  const status = (order.displayFinancialStatus || "").toUpperCase();
  return status !== "REFUNDED" && status !== "VOIDED";
}

/** Money arrives as a string to protect cents; parsed exactly once, here. */
export function orderAmount(order: ShopifyOrder): number {
  const parsed = Number.parseFloat(order.totalPriceSet?.shopMoney?.amount ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Shopify global IDs look like "gid://shopify/Order/12345"; we store the stable numeric tail. */
export function orderExternalId(order: ShopifyOrder): string {
  return `shopify:${order.id.split("/").pop() || order.id}`;
}
