import { apiGet, apiPost, apiPatch, apiDelete } from "./api";
import type { RecurringRule } from "./types";

/**
 * Recurring rule CRUD: see server/routes/recurring.ts. Materialization
 * into real entries happens lazily on the backend (server/lib/recurring.ts);
 * the frontend only ever manages the rule itself.
 */

export async function fetchRecurringRules(businessId: string): Promise<RecurringRule[]> {
  return apiGet<RecurringRule[]>(`/recurring?businessId=${businessId}`);
}

export interface NewRecurringRule {
  kind: "expense" | "revenue";
  amount: number;
  category: string;
  note: string;
  frequency: "weekly" | "monthly" | "yearly";
  startDate: string;
}

export async function createRecurringRule(businessId: string, input: NewRecurringRule): Promise<RecurringRule> {
  return apiPost<RecurringRule>(`/recurring?businessId=${businessId}`, input);
}

/** Pauses or resumes a rule: a paused rule stops materializing new entries until resumed. */
export async function setRecurringActive(businessId: string, id: string, active: boolean): Promise<RecurringRule> {
  return apiPatch<RecurringRule>(`/recurring/${id}?businessId=${businessId}`, { active });
}

export interface RecurringRuleEdits {
  kind: "expense" | "revenue";
  amount: number;
  category: string;
  note: string;
  frequency: "weekly" | "monthly" | "yearly";
}

/** Edits a rule's own fields (amount, category, note, frequency, kind); not the pause/resume toggle, see setRecurringActive. */
export async function updateRecurringRule(businessId: string, id: string, edits: RecurringRuleEdits): Promise<RecurringRule> {
  return apiPatch<RecurringRule>(`/recurring/${id}?businessId=${businessId}`, edits);
}

export async function deleteRecurringRule(businessId: string, id: string): Promise<void> {
  await apiDelete(`/recurring/${id}?businessId=${businessId}`);
}
