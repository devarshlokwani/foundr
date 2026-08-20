import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A Category is a label a founder uses to classify their money.
 *
 * Scoped to the user and to a kind (expense / revenue / investment / draw /
 * debt), so each founder builds their own personalised lists over time. We
 * seed a few sensible defaults on first use, but from then on it's
 * entirely theirs — they can add their own and we remember them.
 *
 * Note: `kind` uses "revenue" (not "income") to match the renamed tab.
 * The transaction itself still stores type "income" at the data layer
 * for now; the category list is just the user-facing labelling.
 */
const categorySchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    businessId: { type: String, required: true, index: true },
    kind: { type: String, enum: ["expense", "revenue", "investment", "draw", "debt"], required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// A user can't have the same category name twice within one kind, per business.
categorySchema.index({ userId: 1, businessId: 1, kind: 1, name: 1 }, { unique: true });

export type Category = InferSchemaType<typeof categorySchema>;

export const CategoryModel = mongoose.model("Category", categorySchema);