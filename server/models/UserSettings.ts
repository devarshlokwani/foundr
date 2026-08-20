import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * Per-user settings. One document per founder (keyed by Clerk userId).
 *
 * Theme is which of Foundr's colour schemes the app renders in — a
 * personal preference that applies everywhere, not tied to any one
 * business. gender is a profile fact that doesn't belong to Clerk (which
 * owns name/email/auth identity) — this model is the home for
 * Foundr-specific per-user preferences and profile details.
 *
 * Currency and the business's display name are deliberately NOT here —
 * they live on Business.ts instead, since a founder tracking one startup
 * in INR and another in AUD needs each business to keep its own choice,
 * not share one account-wide setting.
 *
 * activeBusinessId is which of the founder's businesses (see Business.ts)
 * their dashboard currently shows — a founder can run several side
 * hustles, each fully isolated, and this is the pointer to "which one am I
 * looking at right now". onboarded gates the one-time welcome wizard.
 */
const userSettingsSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    theme: {
      type: String,
      enum: ["light", "dark", "royal", "ocean", "sunset", "slate"],
      default: "light",
    },
    gender: {
      type: String,
      enum: ["male", "female", "non_binary", "prefer_not_to_say", ""],
      default: "",
    },
    activeBusinessId: { type: String, default: "" },
    onboarded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type UserSettings = InferSchemaType<typeof userSettingsSchema>;

export const UserSettingsModel = mongoose.model("UserSettings", userSettingsSchema);