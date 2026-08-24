import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A Business is one of a founder's startups/side hustles. Every ledger
 * document (Expense, Investment, Draw, Debt, Category, Milestone) belongs
 * to exactly one Business, so each startup gets its own isolated
 * dashboard: a founder running multiple ventures never sees one startup's
 * numbers bleed into another's.
 *
 * `currency` lives here rather than on UserSettings because it's a
 * per-startup fact, not a personal one: a founder tracking one business
 * in INR and another in AUD needs each to keep its own choice.
 */
const businessSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    currency: {
      type: String,
      enum: ["USD", "AUD", "INR", "EUR", "GBP", "CAD", "SGD"],
      default: "AUD",
    },
  },
  { timestamps: true }
);

export type Business = InferSchemaType<typeof businessSchema>;

export const BusinessModel = mongoose.model("Business", businessSchema);
