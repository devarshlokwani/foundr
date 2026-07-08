import { getClerk } from "../../features/auth/auth.service";

/**
 * Authenticated API client for talking to the Foundr backend.
 *
 * Every call attaches the current Clerk session token as a Bearer token,
 * which is what the server's clerkMiddleware reads to identify the founder.
 * Without this, the backend rejects the request with 401 — so all data
 * calls must go through here, not raw fetch().
 *
 * Base path is /api, which Vite's dev proxy forwards to the Express server
 * on :3000. In production both are served from the same origin.
 */

async function authHeaders(): Promise<Record<string, string>> {
  const clerk = await getClerk();
  const token = clerk?.session ? await clerk.session.getToken() : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response had no JSON body; keep the generic message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: await authHeaders() });
  return handle<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  return handle<T>(res);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  return handle<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  return handle<T>(res);
}