import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A link between one of a founder's businesses and one Shopify store.
 *
 * Scoped per business, not per account, because a founder running two
 * startups tracks them separately everywhere else in Foundr and their
 * storefronts are no different: one business, one store, its revenue
 * landing only in that business's ledger.
 *
 * `accessToken` is stored encrypted (see lib/tokenCrypto.ts) and is never
 * returned to the client by any route. It is a Shopify Admin API token
 * that can read a merchant's entire order history, so it gets treated like
 * a password rather than like configuration.
 *
 * `ordersSyncedThrough` is the incremental sync watermark: the created-at
 * timestamp of the newest order already pulled in. The next sync asks
 * Shopify only for orders after it, so pressing "Sync now" repeatedly
 * stays cheap instead of re-walking the whole store each time.
 */
const shopifyConnectionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    businessId: { type: String, required: true, index: true },
    shopDomain: { type: String, required: true, trim: true },
    /** Display name from Shopify, so the UI can show the store, not the domain. */
    shopName: { type: String, default: "", trim: true },
    accessToken: { type: String, required: true },
    /** True when the merchant granted read_all_orders, so history past 60 days is reachable. */
    hasFullHistoryScope: { type: Boolean, default: false },
    ordersSyncedThrough: { type: Date, default: null },
    /**
     * The oldest order already pulled in. Needed because a founder whose
     * allowance only covered part of their store has a backlog older than
     * everything they have, and without this the older orders would be
     * stranded: forward-only syncing would never look back at them, even
     * after an upgrade removed the limit that stopped them the first time.
     */
    oldestOrderSynced: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },
    totalOrdersSynced: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "error"], default: "active" },
    lastError: { type: String, default: "" },
  },
  { timestamps: true }
);

/** One store per business. Reconnecting replaces the link rather than stacking a second one. */
shopifyConnectionSchema.index({ userId: 1, businessId: 1 }, { unique: true });

export type ShopifyConnection = InferSchemaType<typeof shopifyConnectionSchema>;

export const ShopifyConnectionModel = mongoose.model("ShopifyConnection", shopifyConnectionSchema);
