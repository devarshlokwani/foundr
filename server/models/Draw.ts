import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A Draw is money the founder takes OUT of the business for personal use —
 * the mirror image of an Investment. Kept separate from Expense on purpose:
 * an expense is the business spending to operate; a draw is the owner
 * withdrawing equity. Conflating the two would silently corrupt burn rate
 * and gross margin, and this is exactly what makes a real balance sheet
 * (Assets = Liabilities + Equity) possible instead of just a cash tracker.
 */
const drawSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    businessId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true },
    note: { type: String, trim: true, default: "" },
    date: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

export type Draw = InferSchemaType<typeof drawSchema>;

export const DrawModel = mongoose.model("Draw", drawSchema);
