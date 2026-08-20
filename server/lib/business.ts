import { BusinessModel } from "../models/Business.js";
import { ExpenseModel } from "../models/Expense.js";
import { InvestmentModel } from "../models/Investment.js";
import { DrawModel } from "../models/Draw.js";
import { DebtModel } from "../models/Debt.js";
import { CategoryModel } from "../models/Category.js";
import { MilestoneModel } from "../models/Milestone.js";

/**
 * Ensures a founder has at least one Business, creating a default one and
 * backfilling any pre-multi-business ledger data into it. Idempotent — a
 * no-op for anyone who already has a business, which is everyone after
 * their first call. This is what lets `businessId` be a required field on
 * every ledger model without a separate, one-time migration script: the
 * backfill runs lazily, the first time each existing user's data is touched.
 */
export async function ensureDefaultBusiness(userId: string): Promise<void> {
  const existing = await BusinessModel.exists({ userId });
  if (existing) return;

  const business = await BusinessModel.create({ userId, name: "My Business" });
  const businessId = String(business._id);

  await Promise.all([
    ExpenseModel.updateMany({ userId, businessId: { $exists: false } }, { $set: { businessId } }),
    InvestmentModel.updateMany({ userId, businessId: { $exists: false } }, { $set: { businessId } }),
    DrawModel.updateMany({ userId, businessId: { $exists: false } }, { $set: { businessId } }),
    DebtModel.updateMany({ userId, businessId: { $exists: false } }, { $set: { businessId } }),
    CategoryModel.updateMany({ userId, businessId: { $exists: false } }, { $set: { businessId } }),
    MilestoneModel.updateMany({ userId, businessId: { $exists: false } }, { $set: { businessId } }),
  ]);
}

/** Confirms a business exists and belongs to this user. */
export async function ownsBusiness(userId: string, businessId: string): Promise<boolean> {
  if (!businessId) return false;
  return Boolean(await BusinessModel.exists({ _id: businessId, userId }));
}
