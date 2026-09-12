import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { ExpenseModel } from "../models/Expense.js";
import { BusinessModel } from "../models/Business.js";
import { SubscriptionModel } from "../models/Subscription.js";
import {
  checkEntryQuota,
  checkBusinessLimit,
  countEntriesThisMonth,
  getRemainingEntryQuota,
  getEntitlements,
} from "../lib/entitlements.js";

/**
 * Disposable verification for the entitlement rules. Uses a throwaway
 * userId, writes real documents, asserts the real behaviour, then deletes
 * everything it made. Run with: npx tsx server/dev/verify-entitlements.ts
 */

const TEST_USER = "test_entitlements_" + Date.now();
let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass ? "" : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

async function makeEntries(businessId: string, n: number, opts: { deleted?: boolean; lastMonth?: boolean } = {}) {
  const lastMonth = new Date();
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1, 15);

  const docs = Array.from({ length: n }, () => ({
    userId: TEST_USER,
    businessId,
    type: "expense" as const,
    amount: 10,
    category: "Test",
    note: "",
    date: new Date(),
    deletedAt: opts.deleted ? new Date() : null,
    ...(opts.lastMonth ? { createdAt: lastMonth, updatedAt: lastMonth } : {}),
  }));

  // Mongoose's timestamps:true would overwrite the backdated createdAt, so
  // last-month rows go in through the raw driver to keep the date we set.
  if (opts.lastMonth) await ExpenseModel.collection.insertMany(docs as never[]);
  else await ExpenseModel.insertMany(docs);
}

async function main() {
  await connectDB();
  console.log(`\nTest user: ${TEST_USER}\n`);

  const biz = await BusinessModel.create({ userId: TEST_USER, name: "Test Co", currency: "AUD" });
  const businessId = String(biz._id);

  // --- free plan defaults -------------------------------------------------
  check("no subscription doc means free plan", (await getEntitlements(TEST_USER)).plan, "free");
  check("fresh account has 0 entries this month", await countEntriesThisMonth(TEST_USER), 0);
  check("fresh account has full 50 quota", await getRemainingEntryQuota(TEST_USER), 50);

  // --- counting -----------------------------------------------------------
  await makeEntries(businessId, 30);
  check("30 entries counted", await countEntriesThisMonth(TEST_USER), 30);
  check("20 quota remaining", await getRemainingEntryQuota(TEST_USER), 20);
  check("can create 1 more at 30/50", (await checkEntryQuota(TEST_USER, 1)).ok, true);
  check("can create exactly 20 more at 30/50", (await checkEntryQuota(TEST_USER, 20)).ok, true);
  check("cannot create 21 more at 30/50", (await checkEntryQuota(TEST_USER, 21)).ok, false);

  // --- deleted entries still consume quota (no farming) -------------------
  await makeEntries(businessId, 10, { deleted: true });
  check("soft-deleted entries still count", await countEntriesThisMonth(TEST_USER), 40);
  check("deleting does not refund quota", await getRemainingEntryQuota(TEST_USER), 10);

  // --- last month's entries do not count (implicit monthly reset) ---------
  await makeEntries(businessId, 25, { lastMonth: true });
  check("last month's entries excluded", await countEntriesThisMonth(TEST_USER), 40);

  // --- the boundary -------------------------------------------------------
  await makeEntries(businessId, 10);
  check("at exactly 50 used", await countEntriesThisMonth(TEST_USER), 50);
  check("0 quota remaining at limit", await getRemainingEntryQuota(TEST_USER), 0);
  check("cannot create at limit", (await checkEntryQuota(TEST_USER, 1)).ok, false);

  // --- business limit -----------------------------------------------------
  check("can create 2nd business on free", (await checkBusinessLimit(TEST_USER)).ok, true);
  const biz2 = await BusinessModel.create({ userId: TEST_USER, name: "Test Co 2", currency: "AUD" });
  check("cannot create 3rd business on free", (await checkBusinessLimit(TEST_USER)).ok, false);

  // --- premium lifts everything ------------------------------------------
  await SubscriptionModel.create({
    userId: TEST_USER,
    plan: "premium",
    status: "active",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
  });
  check("premium plan resolves", (await getEntitlements(TEST_USER)).plan, "premium");
  check("premium can create entries past 50", (await checkEntryQuota(TEST_USER, 500)).ok, true);
  check("premium can create more businesses", (await checkBusinessLimit(TEST_USER)).ok, true);
  check("premium quota is unlimited", await getRemainingEntryQuota(TEST_USER), null);

  // --- past_due keeps access ---------------------------------------------
  await SubscriptionModel.updateOne({ userId: TEST_USER }, { status: "past_due" });
  check("past_due still premium (card retry grace)", (await getEntitlements(TEST_USER)).plan, "premium");

  // --- cleanup ------------------------------------------------------------
  await Promise.all([
    ExpenseModel.deleteMany({ userId: TEST_USER }),
    BusinessModel.deleteMany({ userId: TEST_USER }),
    SubscriptionModel.deleteMany({ userId: TEST_USER }),
  ]);
  const leftover = await ExpenseModel.countDocuments({ userId: TEST_USER });
  check("cleanup left nothing behind", leftover, 0);
  void biz2;

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}\n`);
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main();
