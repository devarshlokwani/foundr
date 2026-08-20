import type { Request, Response, NextFunction } from "express";
import { getUserId } from "./auth.js";
import { ownsBusiness } from "../lib/business.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      businessId?: string;
    }
  }
}

/**
 * Express middleware: every ledger route needs a `?businessId=` query
 * param naming which of the founder's businesses this request is for, and
 * that business has to actually belong to them — not just filter reads by
 * it, but confirm ownership before any read or write touches ledger data.
 * Mount after `requireUser`. On success, `req.businessId` is set.
 */
export async function requireBusiness(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = getUserId(req);
  const businessId = typeof req.query.businessId === "string" ? req.query.businessId : "";

  if (!businessId) {
    res.status(400).json({ error: "A businessId is required." });
    return;
  }
  if (!userId || !(await ownsBusiness(userId, businessId))) {
    res.status(404).json({ error: "Business not found." });
    return;
  }

  req.businessId = businessId;
  next();
}
