import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A founder's billing state, mirrored from Stripe.
 *
 * The absence of a document means "free plan": every founder starts free,
 * and nothing needs backfilling for accounts that existed before billing
 * did. A document only gets created once someone actually starts a
 * checkout, and from then on Stripe's webhooks keep `status` and
 * `currentPeriodEnd` in sync (see routes/billing.ts).
 *
 * `plan` is Foundr's own notion of entitlement and is deliberately NOT the
 * same field as Stripe's `status`: a subscription that's `past_due` is
 * still `premium` until Stripe gives up on retrying and cancels it, so
 * someone's dashboard doesn't lock the moment a card expires. See
 * lib/entitlements.ts, which is the single place that turns this document
 * into a yes/no answer about what a founder can do.
 *
 * Stripe's own IDs are stored so webhooks can find the right founder, and
 * so the billing portal can be opened for an existing customer rather than
 * creating a duplicate one every time.
 */
const subscriptionSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    plan: { type: String, enum: ["free", "premium"], default: "free" },
    status: {
      type: String,
      enum: ["active", "trialing", "past_due", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused"],
      default: "incomplete",
    },
    stripeCustomerId: { type: String, default: "", index: true },
    stripeSubscriptionId: { type: String, default: "", index: true },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type Subscription = InferSchemaType<typeof subscriptionSchema>;

export const SubscriptionModel = mongoose.model("Subscription", subscriptionSchema);
