import { apiGet, apiPost, apiDelete } from "./api";
import type { ActivityPage, ActivityLogEntry } from "./types";

export async function fetchActivity(businessId: string, page: number, pageSize: number): Promise<ActivityPage> {
  return apiGet<ActivityPage>(`/activity?businessId=${businessId}&page=${page}&pageSize=${pageSize}`);
}

/**
 * Which collection route reverses a given entity type: only the 4 ledger
 * kinds are soft-deletable/restorable; businesses/categories/recurring
 * rules are hard-deleted so there's nothing to undo them through.
 */
function collectionPath(entityType: ActivityLogEntry["entityType"]): string | null {
  switch (entityType) {
    case "expense": return "transactions";
    case "investment": return "investments";
    case "draw": return "draws";
    case "debt": return "debts";
    default: return null;
  }
}

/**
 * Shared by foundr-activity-feed (Dashboard's compact widget) and
 * Settings → Data → Activity (the full paginated history), so "can this
 * row be undone" and "what does undoing it do" stay identical wherever an
 * activity row is shown, not just on Dashboard.
 */
export function canUndoActivity(a: ActivityLogEntry): boolean {
  return (a.action === "create" || a.action === "delete" || a.action === "restore") && collectionPath(a.entityType) !== null;
}

/** Reverses one activity row: undoing a delete restores it, undoing a create/restore (soft-)deletes it again. */
export async function undoActivity(a: ActivityLogEntry, businessId: string): Promise<void> {
  const path = collectionPath(a.entityType);
  if (!path) return;
  if (a.action === "delete") {
    await apiPost(`/${path}/${a.entityId}/restore?businessId=${businessId}`, {});
  } else {
    await apiDelete(`/${path}/${a.entityId}?businessId=${businessId}`);
  }
}

/** Shared by foundr-activity-feed and Settings → Activity, so both timelines read the same way. */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** The full timestamp behind a relative "Xh ago" label, e.g. "Aug 24, 2026, 3:42 PM". */
export function exactTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/**
 * Some activity summaries were written before em-dashes were banned from
 * this codebase and are still sitting in Mongo as-is (audit log rows are
 * immutable history, not something to silently rewrite in place), so this
 * cleans them up at display time instead: "Deleted 120 expense: Tools" is
 * exactly what the current summary-writing code already produces for new
 * rows, so old ones just get reshaped to match on the way to the screen.
 */
export function cleanSummary(summary: string): string {
  return summary.replace(/\s*—\s*/g, ": ");
}
