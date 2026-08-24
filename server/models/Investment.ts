import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * An Investment is money the founder puts into the business from their
 * own pocket. This is Foundr's differentiator, tracking the founder's
 * personal stake so we can answer "am I getting my money back?".
 *
 * Kept separate from income (in Transaction) on purpose: income is the
 * business earning money; investment is the founder funding it. ROI is
 * computed by comparing what's been returned against total investment.
 *
 * `deletedAt` makes deletion recoverable: see Expense.ts for the full
 * reasoning, identical here.
 */
const investmentSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    businessId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    source: { type: String, trim: true, default: "Personal savings" },
    note: { type: String, trim: true, default: "" },
    date: { type: Date, required: true, default: Date.now },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type Investment = InferSchemaType<typeof investmentSchema>;

export const InvestmentModel = mongoose.model("Investment", investmentSchema);