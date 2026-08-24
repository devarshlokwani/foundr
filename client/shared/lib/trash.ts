import { apiGet, apiPost, apiDelete } from "./api";
import type { UnifiedEntry, TrashedEntry } from "./types";

/**
 * Deleting an entry (see foundr-transactions.ts's _delete) is soft — the
 * backend keeps the document with `deletedAt` set instead of removing it.
 * This is the shared client-side routing for the follow-up actions
 * (restore, permanently delete), used both by the "Undo" toast right
 * after a delete and by the dedicated Trash view — same `_path`-by-source
 * routing pattern foundr-transactions.ts already uses for edit/delete.
 */

function collectionPath(e: UnifiedEntry): string {
  switch (e.source) {
    case "investment": return "investments";
    case "draw": return "draws";
    case "debt": return "debts";
    default: return "transactions";
  }
}

export async function fetchTrash(businessId: string): Promise<TrashedEntry[]> {
  return apiGet<TrashedEntry[]>(`/trash?businessId=${businessId}`);
}

export async function restoreEntry(e: UnifiedEntry, businessId: string): Promise<void> {
  await apiPost(`/${collectionPath(e)}/${e.id}/restore?businessId=${businessId}`, {});
}

export async function permanentlyDeleteEntry(e: UnifiedEntry, businessId: string): Promise<void> {
  await apiDelete(`/${collectionPath(e)}/${e.id}/permanent?businessId=${businessId}`);
}
