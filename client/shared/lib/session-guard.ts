import type { Clerk } from "@clerk/clerk-js";

/**
 * Forces re-authentication after a tab has been closed for a while.
 *
 * Clerk persists a signed-in session across browser restarts by design —
 * closing a tab and reopening the site resumes the same session
 * indefinitely, with no prompt to sign in again. Foundr wants a shorter
 * leash: close the tab, and the session should be forgotten after a short
 * grace period (in case that was an accidental close), not kept forever.
 *
 * Implementation: every open, signed-in tab periodically stamps a
 * `{sessionId, ts}` heartbeat into localStorage (shared across tabs of the
 * same browser). On each protected page's load, if the recorded
 * timestamp for the CURRENT session is older than the grace period, the
 * tab was closed for at least that long — sign out and require a fresh
 * sign-in. A different `sessionId` than what's recorded (a brand-new
 * sign-in, or one from Clerk's own multi-device sync) is never treated as
 * stale, since there's nothing to compare it against yet.
 */

const HEARTBEAT_KEY = "foundr-session-heartbeat";
const GRACE_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 5_000;

interface HeartbeatRecord {
  sessionId: string;
  ts: number;
}

function readRecord(): HeartbeatRecord | null {
  try {
    const raw = localStorage.getItem(HEARTBEAT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HeartbeatRecord>;
    if (typeof parsed.sessionId === "string" && typeof parsed.ts === "number") {
      return parsed as HeartbeatRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function writeRecord(sessionId: string): void {
  try {
    localStorage.setItem(HEARTBEAT_KEY, JSON.stringify({ sessionId, ts: Date.now() }));
  } catch {
    // Storage can be unavailable (private browsing) — freshness just can't be enforced this session.
  }
}

/** Clears the heartbeat so a later sign-in never gets compared against it. */
export function clearSessionHeartbeat(): void {
  try {
    localStorage.removeItem(HEARTBEAT_KEY);
  } catch {
    // ignore
  }
}

let heartbeatStarted = false;

function startHeartbeat(sessionId: string): void {
  if (heartbeatStarted) return;
  heartbeatStarted = true;
  const tick = (): void => writeRecord(sessionId);
  setInterval(tick, HEARTBEAT_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });
  window.addEventListener("beforeunload", tick);
  window.addEventListener("pagehide", tick);
}

/**
 * Call once per page load, right after confirming `clerk.user` exists.
 * Returns false (after signing the founder out) if the tab holding this
 * session was closed for longer than the grace period — the caller
 * should then treat this exactly like "not signed in" and redirect
 * accordingly. Returns true otherwise, and keeps the heartbeat going for
 * as long as this tab stays open.
 */
export async function checkSessionFreshness(clerk: Clerk): Promise<boolean> {
  const sessionId = clerk.session?.id;
  if (!sessionId) return true;

  const record = readRecord();
  const isSameSession = record?.sessionId === sessionId;
  const stale = isSameSession && Date.now() - record.ts > GRACE_MS;

  if (stale) {
    await clerk.signOut();
    clearSessionHeartbeat();
    return false;
  }

  writeRecord(sessionId);
  startHeartbeat(sessionId);
  return true;
}
