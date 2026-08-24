import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A record of a mutation a founder made: who changed what, when. Written
 * by lib/activityLog.ts's logActivity(), called at the end of every
 * create/update/delete/restore across the ledger and config routes.
 * Read-only from the app's own perspective otherwise; nothing here is
 * ever computed from or feeds back into the ledger.
 */
const activityLogSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    businessId: { type: String, required: true, index: true },
    action: { type: String, enum: ["create", "update", "delete", "restore"], required: true },
    entityType: {
      type: String,
      enum: ["expense", "investment", "draw", "debt", "business", "category", "recurring"],
      required: true,
    },
    entityId: { type: String, required: true },
    summary: { type: String, required: true },
  },
  { timestamps: true }
);

export type ActivityLog = InferSchemaType<typeof activityLogSchema>;

export const ActivityLogModel = mongoose.model("ActivityLog", activityLogSchema);
