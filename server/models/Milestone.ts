import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A Milestone is a goal the founder is working toward — "break even on my
 * investment", "reach 10 customers", "first ₹1L in revenue".
 *
 * `targetAmount` is optional because some milestones are monetary (break
 * even at ₹3,00,000 returned) and some are not (launch the MVP). When set,
 * the dashboard can show progress automatically against the founder's
 * actual numbers. `achieved` lets the founder tick it off, with
 * `achievedAt` recording when.
 */
const milestoneSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    targetAmount: { type: Number, min: 0, default: null },
    targetDate: { type: Date, default: null },
    achieved: { type: Boolean, default: false },
    achievedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type Milestone = InferSchemaType<typeof milestoneSchema>;

export const MilestoneModel = mongoose.model("Milestone", milestoneSchema);
