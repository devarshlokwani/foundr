import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * An Expense (or income) entry recorded by a founder.
 *
 * This is the heart of the MVP: the founder enters an amount and a
 * category, and everything else (burn, runway, ROI, margins) is
 * calculated from a collection of these.
 *
 * `userId` is the Clerk user ID, so each founder only ever sees their own
 * entries. `type` distinguishes money going out (expense) from money
 * coming in (income), which is what lets us compute net position and ROI.
 *
 * `isCapital` marks an expense as a capital purchase: equipment or a tool
 * the business keeps, rather than a consumed operating cost. It still
 * counts as cash out, but on the balance sheet it becomes a Fixed Asset
 * instead of reducing retained earnings. Defaults false so it never
 * changes the meaning of existing entries.
 *
 * `deletedAt` makes deletion recoverable: a non-null value means "in the
 * trash," not gone. Every read query across the app filters `deletedAt:
 * null` so a soft-deleted entry disappears from lists/reports immediately
 * without losing the underlying data.
 */
const expenseSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    businessId: { type: String, required: true, index: true },
    type: { type: String, enum: ["expense", "income"], required: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true },
    note: { type: String, trim: true, default: "" },
    date: { type: Date, required: true, default: Date.now },
    isCapital: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    source: { type: String, enum: ["manual", "shopify"], default: "manual" },
    externalId: { type: String, default: "" },
  },
  { timestamps: true }
);

/**
 * Stops a re-sync from double-counting revenue, which in a finance app is
 * about the worst bug available: the founder's income would silently
 * inflate every time they pressed "Sync now".
 *
 * Partial, so it only applies to rows that actually came from an external
 * system. Every manually added entry has `externalId: ""`, and without the
 * filter a unique index would treat all of them as duplicates of each
 * other and refuse the second one.
 */
expenseSchema.index(
  { businessId: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $gt: "" } } }
);

export type Expense = InferSchemaType<typeof expenseSchema>;

export const ExpenseModel = mongoose.model("Expense", expenseSchema);