import { Router, type Request, type Response } from "express";
import { requireUser, getUserId } from "../middleware/auth.js";
import { getEntitlements } from "../lib/entitlements.js";

/**
 * Entitlements API: what plan the founder is on, what that plan allows,
 * and how much of it they've used this month.
 *
 * The client reads this to show usage before a founder hits a wall ("37 of
 * 50 entries used"), but it is never the thing that enforces anything. The
 * limits are enforced server-side inside each create route, because a
 * check that lives only in the UI is a suggestion, not a limit.
 *
 * Routes:
 *   GET /api/entitlements   current plan, limits, and usage
 */
const router = Router();

router.use(requireUser);

router.get("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  res.json(await getEntitlements(userId));
});

export default router;
