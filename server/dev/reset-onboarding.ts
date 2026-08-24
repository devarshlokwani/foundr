import "dotenv/config";
import mongoose from "mongoose";
import { UserSettingsModel } from "../models/UserSettings.js";

/**
 * Dev-only utility: flips `onboarded` back to false so the next /dashboard
 * load shows the onboarding wizard again, instead of only ever seeing it
 * once on a real signup. Not part of the running app; run directly with
 * `npm run reset-onboarding` (see package.json).
 *
 * Finishing the wizard afterward creates a real new Business each time
 * (that's the actual flow being tested), so repeated runs will leave a
 * few extra test businesses behind. Delete those from Settings →
 * Startups once you're done, or via DELETE /api/businesses/:id.
 */
async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  await mongoose.connect(uri);

  const userId = process.argv[2];
  const matches = await UserSettingsModel.find(userId ? { userId } : {});

  if (matches.length === 0) {
    console.error(userId ? `No account found for userId ${userId}.` : "No accounts found.");
    process.exitCode = 1;
    return;
  }
  if (!userId && matches.length > 1) {
    console.error(`Found ${matches.length} accounts, re-run with one of these as an argument:`);
    for (const m of matches) console.error(`  npm run reset-onboarding -- ${m.userId}`);
    process.exitCode = 1;
    return;
  }

  for (const doc of matches) {
    doc.onboarded = false;
    await doc.save();
    console.log(`Reset onboarding for ${doc.userId}. Visit /dashboard signed in as that account to see the wizard.`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
