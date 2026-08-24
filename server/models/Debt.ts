import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A Debt entry is money borrowed for the business, or a repayment against
 * money already borrowed. `type` distinguishes the two directions; the
 * outstanding balance is always derived (sum of "borrow" minus sum of
 * "repay"), never stored, so it can't drift out of sync with the ledger.
 *
 * This is the Liabilities side of the balance sheet: without it, a loan
 * or credit card balance had nowhere honest to go (not an expense, not an
 * investment).
 *
 * `deletedAt` makes deletion recoverable: see Expense.ts for the full
 * reasoning, identical here.
 */
const debtSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    businessId: { type: String, required: true, index: true },
    type: { type: String, enum: ["borrow", "repay"], required: true },
    amount: { type: Number, required: true, min: 0 },
    source: { type: String, trim: true, default: "Bank loan" },
    note: { type: String, trim: true, default: "" },
    date: { type: Date, required: true, default: Date.now },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type Debt = InferSchemaType<typeof debtSchema>;

export const DebtModel = mongoose.model("Debt", debtSchema);
