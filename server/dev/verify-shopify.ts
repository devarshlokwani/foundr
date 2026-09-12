import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { ExpenseModel } from "../models/Expense.js";
import { normalizeShopDomain, isRevenueOrder, orderAmount, orderExternalId, ShopifyError, type ShopifyOrder } from "../lib/shopify.js";
import { encryptToken, decryptToken, isEncryptionConfigured } from "../lib/tokenCrypto.js";

/**
 * Verification for the parts of the Shopify integration that can be
 * checked without a live store: domain parsing, revenue classification,
 * token encryption, and the deduplication index that stops a re-sync from
 * double-counting revenue.
 *
 * Run with: npx tsx server/dev/verify-shopify.ts
 */

const TEST_USER = "test_shopify_" + Date.now();
const TEST_BIZ = "biz_" + Date.now();
let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass ? "" : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

function checkThrows(label: string, fn: () => unknown): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) failures++;
  console.log(`${threw ? "PASS" : "FAIL"}  ${label}`);
}

function order(overrides: Partial<ShopifyOrder> = {}): ShopifyOrder {
  return {
    id: "gid://shopify/Order/1001",
    name: "#1001",
    createdAt: new Date().toISOString(),
    cancelledAt: null,
    displayFinancialStatus: "PAID",
    totalPriceSet: { shopMoney: { amount: "129.95", currencyCode: "AUD" } },
    ...overrides,
  };
}

async function main() {
  await connectDB();
  console.log(`\nTest user: ${TEST_USER}\n`);

  // --- domain parsing: what a founder actually pastes --------------------
  check("bare handle", normalizeShopDomain("mystore"), "mystore.myshopify.com");
  check("full domain", normalizeShopDomain("mystore.myshopify.com"), "mystore.myshopify.com");
  check("with https", normalizeShopDomain("https://mystore.myshopify.com"), "mystore.myshopify.com");
  check("with trailing path", normalizeShopDomain("https://mystore.myshopify.com/admin"), "mystore.myshopify.com");
  check("uppercase and spaces", normalizeShopDomain("  MyStore.MyShopify.com  "), "mystore.myshopify.com");
  checkThrows("rejects a non-Shopify domain", () => normalizeShopDomain("example.com"));
  checkThrows("rejects empty input", () => normalizeShopDomain(""));

  // --- revenue classification -------------------------------------------
  check("paid order is revenue", isRevenueOrder(order()), true);
  check("cancelled order is not", isRevenueOrder(order({ cancelledAt: new Date().toISOString() })), false);
  check("refunded order is not", isRevenueOrder(order({ displayFinancialStatus: "REFUNDED" })), false);
  check("voided order is not", isRevenueOrder(order({ displayFinancialStatus: "VOIDED" })), false);
  check("pending order still counts", isRevenueOrder(order({ displayFinancialStatus: "PENDING" })), true);

  // --- money and IDs ------------------------------------------------------
  check("amount parsed to cents", orderAmount(order()), 129.95);
  check("missing amount is 0 not NaN", orderAmount(order({ totalPriceSet: undefined as never })), 0);
  check("external id from gid", orderExternalId(order()), "shopify:1001");

  // --- token encryption ---------------------------------------------------
  if (isEncryptionConfigured()) {
    const secret = "shpat_abc123def456";
    const sealed = encryptToken(secret);
    check("ciphertext is not the plaintext", sealed.includes(secret), false);
    check("round trips", decryptToken(sealed), secret);
    check("versioned format", sealed.startsWith("v1:"), true);
    const other = encryptToken(secret);
    check("same input gives different ciphertext (random iv)", sealed === other, false);
    checkThrows("tampered ciphertext is rejected", () => decryptToken(sealed.slice(0, -4) + "AAAA"));
  } else {
    console.log("SKIP  token encryption (TOKEN_ENCRYPTION_KEY not set)");
  }

  // --- the dedup index: the property that protects revenue accuracy -------
  await ExpenseModel.syncIndexes();
  console.log("PASS  dedup index built on existing collection");

  const base = {
    userId: TEST_USER, businessId: TEST_BIZ, type: "income" as const,
    amount: 129.95, category: "Shopify sales", note: "Shopify order #1001",
    date: new Date(), source: "shopify" as const, externalId: "shopify:1001",
  };

  await ExpenseModel.create(base);
  let rejected = false;
  try {
    await ExpenseModel.create(base);
  } catch (err) {
    rejected = (err as { code?: number }).code === 11000;
  }
  check("re-syncing the same order is rejected", rejected, true);
  check("only one entry exists for that order", await ExpenseModel.countDocuments({ businessId: TEST_BIZ, externalId: "shopify:1001" }), 1);

  // The same order in a *different* business is legitimate and must work.
  await ExpenseModel.create({ ...base, businessId: TEST_BIZ + "_other" });
  check("same order id allowed in another business", await ExpenseModel.countDocuments({ externalId: "shopify:1001" }), 2);

  // Manual entries all share externalId "" and must not collide.
  await ExpenseModel.create({ userId: TEST_USER, businessId: TEST_BIZ, type: "expense", amount: 10, category: "Tools", date: new Date() });
  await ExpenseModel.create({ userId: TEST_USER, businessId: TEST_BIZ, type: "expense", amount: 20, category: "Tools", date: new Date() });
  check("multiple manual entries coexist (partial index)", await ExpenseModel.countDocuments({ businessId: TEST_BIZ, externalId: "" }), 2);

  // --- cleanup ------------------------------------------------------------
  await ExpenseModel.deleteMany({ userId: TEST_USER });
  check("cleanup left nothing behind", await ExpenseModel.countDocuments({ userId: TEST_USER }), 0);

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}\n`);
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof ShopifyError ? err.message : err);
  process.exit(1);
});
