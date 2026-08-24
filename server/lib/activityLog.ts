import { ActivityLogModel } from "../models/ActivityLog.js";

export type ActivityAction = "create" | "update" | "delete" | "restore";
export type ActivityEntityType = "expense" | "investment" | "draw" | "debt" | "business" | "category" | "recurring";

export interface ActivityParams {
  userId: string;
  businessId: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  summary: string;
}

/**
 * Records one activity-log entry. Awaited but never lets a logging
 * failure break the actual financial operation it's describing: the
 * mutation the caller just made already succeeded by the time this runs,
 * and a missed log line is far cheaper than a failed request.
 */
export async function logActivity(params: ActivityParams): Promise<void> {
  try {
    await ActivityLogModel.create(params);
  } catch (err) {
    console.error("[activityLog] Failed to record activity:", err);
  }
}
