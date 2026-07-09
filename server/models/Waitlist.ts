import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A Waitlist signup — someone who registered interest before launch.
 * Email is unique so the same person can't sign up twice.
 */
const waitlistSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    source: { type: String, trim: true, default: "landing" },
  },
  { timestamps: true }
);

export type Waitlist = InferSchemaType<typeof waitlistSchema>;

export const WaitlistModel = mongoose.model("Waitlist", waitlistSchema);