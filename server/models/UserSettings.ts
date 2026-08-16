import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * Per-user settings. One document per founder (keyed by Clerk userId).
 *
 * Currency is the first setting: the user's chosen display currency, used
 * everywhere money is shown. We default new users to AUD at the schema
 * level, but the frontend seeds a smarter default from their browser
 * locale on first save. Theme is which of Foundr's colour schemes the app
 * renders in. businessName and gender are profile facts that don't belong
 * to Clerk (which owns name/email/auth identity) — this model is the home
 * for Foundr-specific per-user preferences and profile details.
 */
const userSettingsSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    currency: {
      type: String,
      enum: ["USD", "AUD", "INR", "EUR", "GBP", "CAD", "SGD"],
      default: "AUD",
    },
    theme: {
      type: String,
      enum: ["light", "dark", "royal", "ocean", "sunset", "slate"],
      default: "light",
    },
    businessName: { type: String, trim: true, default: "" },
    gender: {
      type: String,
      enum: ["male", "female", "non_binary", "prefer_not_to_say", ""],
      default: "",
    },
  },
  { timestamps: true }
);

export type UserSettings = InferSchemaType<typeof userSettingsSchema>;

export const UserSettingsModel = mongoose.model("UserSettings", userSettingsSchema);