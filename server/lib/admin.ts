import { clerkClient } from "@clerk/express";

/**
 * Who counts as an administrator.
 *
 * Driven by `ADMIN_EMAILS` (comma separated) rather than a flag in the
 * database, so admin access can't be granted by anything that can write to
 * Mongo: it takes access to the server's environment, which is a much
 * higher bar. It also means no migration or seed step to remember.
 *
 * Admins bypass plan limits entirely. That exists so the person running
 * Foundr can exercise paid features while testing without buying their own
 * product, and it is deliberately a separate concept from being a paying
 * customer: an admin has no Stripe subscription, so billing code never has
 * to special-case them.
 *
 * The email is resolved through Clerk, which owns identity, and cached
 * because it is checked on every limit-guarded write and the answer
 * effectively never changes within a process's lifetime.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { isAdmin: boolean; at: number }>();

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdmin(userId: string): Promise<boolean> {
  const allowed = adminEmails();
  if (allowed.length === 0) return false;

  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.isAdmin;

  let result = false;
  try {
    const user = await clerkClient.users.getUser(userId);
    // A founder can have several verified addresses; any of them matching
    // is enough, so admin access doesn't depend on which one is primary.
    result = user.emailAddresses.some((e) => allowed.includes(e.emailAddress.toLowerCase()));
  } catch {
    // Clerk being unreachable must not hand out admin, and must not break
    // the request either: the caller falls back to normal plan limits.
    result = false;
  }

  cache.set(userId, { isAdmin: result, at: Date.now() });
  return result;
}
