import { Router, type Request, type Response } from "express";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { ShopifyConnectionModel } from "../models/ShopifyConnection.js";
import { BusinessModel } from "../models/Business.js";
import { ExpenseModel } from "../models/Expense.js";
import { encryptToken, isEncryptionConfigured } from "../lib/tokenCrypto.js";
import { normalizeShopDomain, verifyConnection, ShopifyError } from "../lib/shopify.js";
import { syncShopifyOrders } from "../lib/shopifySync.js";
import { getEntitlements } from "../lib/entitlements.js";
import { logActivity } from "../lib/activityLog.js";

/**
 * Shopify API: connect a store to a business and pull its orders in as
 * revenue entries.
 *
 * The access token is encrypted before it is stored and is never included
 * in any response from these routes, not even masked. Everything the UI
 * needs to show ("connected to Acme Co, last synced 5 minutes ago") is
 * derived from the other fields.
 *
 * Routes:
 *   GET    /api/shopify?businessId=          connection status
 *   POST   /api/shopify/connect?businessId=  { shopDomain, accessToken }
 *   POST   /api/shopify/sync?businessId=     pull orders into the ledger
 *   DELETE /api/shopify?businessId=          disconnect (keeps synced entries)
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

/** The connection as the client is allowed to see it: everything except the token. */
function publicShape(conn: InstanceType<typeof ShopifyConnectionModel> | null) {
  if (!conn) return { connected: false };
  return {
    connected: true,
    shopDomain: conn.shopDomain,
    shopName: conn.shopName,
    hasFullHistoryScope: conn.hasFullHistoryScope,
    lastSyncedAt: conn.lastSyncedAt,
    totalOrdersSynced: conn.totalOrdersSynced,
    status: conn.status,
    lastError: conn.lastError,
  };
}

function handleShopifyError(err: unknown, res: Response): Response {
  if (err instanceof ShopifyError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof Error && /TOKEN_ENCRYPTION_KEY/.test(err.message)) {
    return res.status(500).json({ error: "Shopify connections aren't configured on this server yet." });
  }
  throw err;
}

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId!;
  const conn = await ShopifyConnectionModel.findOne({ userId, businessId });
  res.json(publicShape(conn));
});

router.post("/connect", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId!;
  const { shopDomain, accessToken } = req.body ?? {};

  if (!accessToken || typeof accessToken !== "string" || !accessToken.trim()) {
    return res.status(400).json({ error: "An Admin API access token is required." });
  }
  if (!isEncryptionConfigured()) {
    return res.status(500).json({ error: "Shopify connections aren't configured on this server yet." });
  }

  try {
    const domain = normalizeShopDomain(shopDomain);
    // Verified before saving, so a bad token fails here with a clear reason
    // rather than becoming a sync that mysteriously returns nothing.
    const info = await verifyConnection(domain, accessToken.trim());

    await ShopifyConnectionModel.findOneAndUpdate(
      { userId, businessId },
      {
        userId,
        businessId,
        shopDomain: domain,
        shopName: info.shopName,
        accessToken: encryptToken(accessToken.trim()),
        hasFullHistoryScope: info.hasFullHistoryScope,
        status: "active",
        lastError: "",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    void logActivity({
      userId, businessId, action: "create", entityType: "business", entityId: businessId,
      summary: `Connected Shopify store: ${info.shopName}`,
    });

    // A store trading in a different currency than the business would post
    // numbers that look right and are wrong, so it is surfaced as a warning
    // rather than silently ignored.
    const business = await BusinessModel.findOne({ _id: businessId, userId });
    const currencyMismatch =
      business && business.currency !== info.currencyCode
        ? `This store sells in ${info.currencyCode}, but this startup is set to ${business.currency}. Orders import at their ${info.currencyCode} value without conversion.`
        : null;

    const conn = await ShopifyConnectionModel.findOne({ userId, businessId });
    res.json({ ...publicShape(conn), currencyMismatch });
  } catch (err) {
    return handleShopifyError(err, res);
  }
});

router.post("/sync", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId!;

  try {
    const result = await syncShopifyOrders(userId, businessId);
    const [conn, entitlements] = await Promise.all([
      ShopifyConnectionModel.findOne({ userId, businessId }),
      getEntitlements(userId),
    ]);
    res.json({ ...result, connection: publicShape(conn), entitlements });
  } catch (err) {
    return handleShopifyError(err, res);
  }
});

/**
 * Disconnecting removes the stored credential but deliberately leaves
 * already-synced entries in the ledger: they are real revenue the business
 * earned, and deleting a founder's income history because they revoked an
 * API token would be destroying records they still need.
 */
router.delete("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId!;

  const conn = await ShopifyConnectionModel.findOneAndDelete({ userId, businessId });
  if (!conn) return res.status(404).json({ error: "No Shopify store is connected to this startup." });

  const keptEntries = await ExpenseModel.countDocuments({ businessId, source: "shopify", deletedAt: null });

  void logActivity({
    userId, businessId, action: "delete", entityType: "business", entityId: businessId,
    summary: `Disconnected Shopify store: ${conn.shopName || conn.shopDomain}`,
  });

  res.json({ ok: true, keptEntries });
});

export default router;
