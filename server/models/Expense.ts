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
 * `isCapital` marks an expense as a capital purchase — equipment or a tool
 * the business keeps, rather than a consumed operating cost. It still
 * counts as cash out, but on the balance sheet it becomes a Fixed Asset
 * instead of reducing retained earnings. Defaults false so it never
 * changes the meaning of existing entries.
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
  },
  { timestamps: true }
);

export type Expense = InferSchemaType<typeof expenseSchema>;

export const ExpenseModel = mongoose.model("Expense", expenseSchema);