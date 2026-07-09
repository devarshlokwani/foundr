/**
 * Waitlist API client for the pre-launch landing page.
 *
 * The waitlist server runs separately from the frontend. In dev it's on
 * localhost:3001; in production it's the Render URL, injected at build time
 * via VITE_WAITLIST_API. We read that env var and fall back to localhost.
 */

const BASE = (import.meta.env.VITE_WAITLIST_API as string | undefined) || "http://localhost:3001";

export interface WaitlistResult {
  ok: boolean;
  already?: boolean;
  error?: string;
}

export async function joinWaitlist(email: string): Promise<WaitlistResult> {
  try {
    const res = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.error || "Something went wrong. Please try again." };
    }
    return { ok: true, already: body?.already === true };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Please try again." };
  }
}