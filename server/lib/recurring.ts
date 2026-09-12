import { RecurringRuleModel } from "../models/RecurringRule.js";
import { ExpenseModel } from "../models/Expense.js";
import { getRemainingEntryQuota } from "./entitlements.js";

type Frequency = "weekly" | "monthly" | "yearly";

function advance(date: Date, frequency: Frequency): Date {
  const next = new Date(date);
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

/**
 * Materializes any due RecurringRules into real Expense/income entries.
 *
 * Lazy: no cron job or scheduler process, matching the existing
 * ensureDefaultBusiness() backfill precedent in lib/business.ts. Called at
 * the top of the routes a founder actually looks at (GET /api/entries,
 * GET /api/metrics), so a rule just shows up next time they check,
 * catching up on every period missed since nextRunDate if they haven't
 * opened the app in a while, rather than only creating one entry.
 *
 * Monthly entry quota interacts with this carefully. A founder on the free
 * plan can run out of allowance mid-backlog, and the handling matters:
 *
 *   - Only as many entries as there is quota for get created, and
 *     `nextRunDate` is left pointing at the first period that did NOT get
 *     created. Nothing is lost. Once the allowance resets on the 1st (or
 *     they upgrade), the rest catch up on the very next read, which is
 *     exactly the behaviour this function already has for someone who
 *     didn't open the app for two months.
 *
 *   - Advancing `nextRunDate` past a period that was skipped for quota
 *     would silently destroy that entry forever, so it is never done.
 *
 * This runs on read paths (the dashboard, the entries list), so it must
 * never throw or block: the worst acceptable outcome is that an entry
 * shows up slightly later, not that the dashboard fails to load.
 */
export async function materializeDueRules(userId: string, businessId: string): Promise<void> {
  const due = await RecurringRuleModel.find({
    userId,
    businessId,
    active: true,
    nextRunDate: { $lte: new Date() },
  });
  if (due.length === 0) return;

  // Shared across every rule in this pass, since the quota is per account.
  let remaining = await getRemainingEntryQuota(userId);
  if (remaining <= 0) return;

  const now = new Date();
  for (const rule of due) {
    if (remaining <= 0) break;

    const frequency = rule.frequency as Frequency;
    const toCreate: {
      userId: string;
      businessId: string;
      type: "expense" | "income";
      amount: number;
      category: string;
      note: string;
      date: Date;
    }[] = [];

    let runDate = rule.nextRunDate;
    while (runDate <= now && toCreate.length < remaining) {
      toCreate.push({
        userId,
        businessId,
        type: rule.kind === "revenue" ? "income" : "expense",
        amount: rule.amount,
        category: rule.category,
        note: rule.note,
        date: runDate,
      });
      runDate = advance(runDate, frequency);
    }

    if (toCreate.length > 0) {
      await ExpenseModel.insertMany(toCreate);
      remaining -= toCreate.length;
    }
    // runDate is the first period not yet materialized, whether the loop
    // stopped because it caught up to now or because quota ran out.
    rule.nextRunDate = runDate;
    await rule.save();
  }
}
