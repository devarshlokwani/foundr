import { RecurringRuleModel } from "../models/RecurringRule.js";
import { ExpenseModel } from "../models/Expense.js";

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
 * Lazy — no cron job or scheduler process, matching the existing
 * ensureDefaultBusiness() backfill precedent in lib/business.ts. Called at
 * the top of the routes a founder actually looks at (GET /api/entries,
 * GET /api/metrics), so a rule just shows up next time they check —
 * catching up on every period missed since nextRunDate if they haven't
 * opened the app in a while, rather than only creating one entry.
 */
export async function materializeDueRules(userId: string, businessId: string): Promise<void> {
  const due = await RecurringRuleModel.find({
    userId,
    businessId,
    active: true,
    nextRunDate: { $lte: new Date() },
  });
  if (due.length === 0) return;

  const now = new Date();
  for (const rule of due) {
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
    while (runDate <= now) {
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

    if (toCreate.length > 0) await ExpenseModel.insertMany(toCreate);
    rule.nextRunDate = runDate;
    await rule.save();
  }
}
