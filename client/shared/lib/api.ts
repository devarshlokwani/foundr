import { getClerk } from "../../features/auth/auth.service";

/**
 * Authenticated API client for talking to the Foundr backend.
 *
 * Every call attaches the current Clerk session token as a Bearer token,
 * which is what the server's clerkMiddleware reads to identify the founder.
 * Without this, the backend rejects the request with 401, so all data
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

/**
 * An API failure that keeps the HTTP status, so callers can tell apart the
 * failures that need different handling. A 402 in particular is not an
 * error in the usual sense: it means the founder ran into a plan limit,
 * and the right response is an upgrade prompt rather than a red error box.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Present on 402: the plan's ceiling and how much of it is used. */
    readonly limit?: number,
    readonly used?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** True when this failure was a plan limit rather than something going wrong. */
export function isQuotaError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 402;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let limit: number | undefined;
    let used: number | undefined;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (typeof body?.limit === "number") limit = body.limit;
      if (typeof body?.used === "number") used = body.used;
    } catch {
      // response had no JSON body; keep the generic message
    }
    throw new ApiError(message, res.status, limit, used);
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