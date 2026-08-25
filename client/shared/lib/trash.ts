import { apiGet, apiPost, apiDelete } from "./api";
import type { UnifiedEntry, TrashedEntry, EntriesPage } from "./types";

// foundr-trash-list is a self-contained "show me everything" widget, not a
// paginated table, so this asks the (paginated) /api/trash route for one
// big page rather than wiring up page controls it doesn't have room for.
// 200 is the server's own MAX_PAGE_SIZE (see server/lib/entries.ts).
const TRASH_LIST_PAGE_SIZE = 200;

/**
 * Deleting an entry (see foundr-transactions.ts's _delete) is soft: the
 * backend keeps the document with `deletedAt` set instead of removing it.
 * This is the shared client-side routing for the follow-up actions
 * (restore, permanently delete), used both by the "Undo" toast right
 * after a delete and by the dedicated Trash view, same `_path`-by-source
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
  // /api/trash always returns a paginated { items, total, page, pageSize }
  // object (same shape as /api/entries), never a bare array.
  const res = await apiGet<EntriesPage>(`/trash?businessId=${businessId}&pageSize=${TRASH_LIST_PAGE_SIZE}`);
  return res.items as TrashedEntry[];
}

export async function restoreEntry(e: UnifiedEntry, businessId: string): Promise<void> {
  await apiPost(`/${collectionPath(e)}/${e.id}/restore?businessId=${businessId}`, {});
}

export async function permanentlyDeleteEntry(e: UnifiedEntry, businessId: string): Promise<void> {
  await apiDelete(`/${collectionPath(e)}/${e.id}/permanent?businessId=${businessId}`);
}
