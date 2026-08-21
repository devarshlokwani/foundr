import { apiGet, apiPost, apiPatch, apiDelete } from "./api";
import { setCurrency, type CurrencyCode } from "./format";
import type { Business } from "./types";

/**
 * Which of a founder's businesses is currently active — cached in
 * localStorage for an instant read on page load (same pattern as
 * theme.ts), reconciled against the backend's `activeBusinessId` and the
 * real list of businesses every time a page initialises, since it can go
 * stale (switched on another device, or the cached business got deleted).
 */

const STORAGE_KEY = "foundr-active-business";

function getStoredBusinessId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function setStoredBusinessId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage can be unavailable (private browsing); the id still applies for this load.
  }
}

export async function fetchBusinesses(): Promise<Business[]> {
  return apiGet<Business[]>("/businesses");
}

export async function createBusiness(name: string): Promise<Business> {
  return apiPost<Business>("/businesses", { name });
}

export async function renameBusiness(id: string, name: string): Promise<Business> {
  return apiPatch<Business>(`/businesses/${id}`, { name });
}

/** Updates a business's own display currency — a per-startup choice, not an account-wide one. */
export async function setBusinessCurrency(id: string, currency: CurrencyCode): Promise<Business> {
  return apiPatch<Business>(`/businesses/${id}`, { currency });
}

/**
 * Deletes a business. The backend refuses (409) if it still has any
 * tracked expenses, investments, draws, or debts — a founder has to
 * empty it first, so this can never silently destroy real ledger data.
 */
export async function deleteBusiness(id: string): Promise<void> {
  await apiDelete(`/businesses/${id}`);
}

/**
 * Client-side guardrails on top of the backend's own check, so the
 * business switcher and Settings → Startups don't strand a founder with
 * zero businesses or yank away the one they're currently looking at.
 * Returns "" when deleting is fine, or a short reason to show/disable on.
 */
export function deleteBlockedReason(businesses: Business[], id: string, activeId: string): string {
  if (businesses.length <= 1) return "You need at least one startup";
  if (id === activeId) return "Switch to another startup first";
  return "";
}

/** Persists the active business, locally and on the backend. */
export async function setActiveBusiness(id: string): Promise<void> {
  setStoredBusinessId(id);
  await apiPatch("/settings", { activeBusinessId: id });
}

/**
 * The one entry point every ledger-touching page calls during init: fetch
 * the founder's businesses (this also runs the server-side migration for
 * pre-multi-business accounts, so it always returns at least one business
 * unless they're still mid-onboarding), then resolve which one is active
 * — preferring the local cache, falling back to the backend's pointer,
 * falling back to the first business if both are stale or unset.
 *
 * Also applies that business's own currency for the session — currency is
 * per-startup, not per-account, so every page that switches businesses
 * needs to re-apply it here rather than reading a single global value.
 */
export async function resolveActiveBusiness(
  settingsActiveId: string
): Promise<{ businesses: Business[]; activeId: string }> {
  const businesses = await fetchBusinesses();
  if (businesses.length === 0) return { businesses, activeId: "" };

  const cached = getStoredBusinessId();
  const activeId =
    [cached, settingsActiveId].find((id) => id && businesses.some((b) => b._id === id)) ?? businesses[0]._id;

  if (activeId !== cached) setStoredBusinessId(activeId);
  if (activeId !== settingsActiveId) void setActiveBusiness(activeId);

  const active = businesses.find((b) => b._id === activeId);
  if (active) setCurrency(active.currency as CurrencyCode);

  return { businesses, activeId };
}
