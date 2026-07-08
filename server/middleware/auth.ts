import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

/**
 * Auth helpers for Foundr's API.
 *
 * Clerk's `clerkMiddleware()` (wired in index.ts) reads the request's
 * session token and attaches auth info. These helpers build on that:
 *
 * - `requireUser` blocks any request without a valid signed-in user.
 * - `getUserId` pulls the Clerk user ID for use in queries, so every
 *   read and write is scoped to the founder who made the request. This
 *   is what guarantees one founder can never see another's data.
 */

/** Express middleware: reject the request unless a user is signed in. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "You must be signed in to do that." });
    return;
  }
  next();
}

/** Get the signed-in user's Clerk ID. Returns null if not signed in. */
export function getUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}