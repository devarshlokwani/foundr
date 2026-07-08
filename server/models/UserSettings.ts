import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * Per-user settings. One document per founder (keyed by Clerk userId).
 *
 * Currency is the first setting: the user's chosen display currency, used
 * everywhere money is shown. We default new users to AUD at the schema
 * level, but the frontend seeds a smarter default from their browser
 * locale on first save. This model is the home for any future per-user
 * preference (display name, notifications, etc.).
 */
const userSettingsSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    currency: {
      type: String,
      enum: ["USD", "AUD", "INR", "EUR", "GBP", "CAD", "SGD"],
      default: "AUD",
    },
  },
  { timestamps: true }
);

export type UserSettings = InferSchemaType<typeof userSettingsSchema>;

export const UserSettingsModel = mongoose.model("UserSettings", userSettingsSchema);