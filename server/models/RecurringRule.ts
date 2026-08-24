import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A recurring expense or revenue rule: a founder's SaaS bill, a monthly
 * retainer, anything they'd otherwise have to re-type by hand every period.
 *
 * Scoped to expense/revenue only (not investments, draws, or debt) since
 * those are the two genuinely common recurring cases. `nextRunDate` is the
 * next date this rule owes a real Expense entry; see lib/recurring.ts for
 * how it's materialized and advanced.
 */
const recurringRuleSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    businessId: { type: String, required: true, index: true },
    kind: { type: String, enum: ["expense", "revenue"], required: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true },
    note: { type: String, trim: true, default: "" },
    frequency: { type: String, enum: ["weekly", "monthly", "yearly"], required: true },
    nextRunDate: { type: Date, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type RecurringRule = InferSchemaType<typeof recurringRuleSchema>;

export const RecurringRuleModel = mongoose.model("RecurringRule", recurringRuleSchema);
