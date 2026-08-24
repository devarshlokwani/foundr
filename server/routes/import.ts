import { Router, type Request, type Response } from "express";
import { requireUser, getUserId } from "../middleware/auth.js";
import { requireBusiness } from "../middleware/business.js";
import { validateImportRows, importRows, MAX_IMPORT_ROWS } from "../lib/import.js";

/**
 * Bulk import: see lib/import.ts for the row schema and validation.
 * The frontend does the file reading/parsing (JSON or CSV) client-side and
 * sends the already-parsed row objects here; this route only validates and
 * persists them.
 *
 * Routes:
 *   POST /api/import?businessId=  body: { rows: unknown[] }
 */
const router = Router();

router.use(requireUser);
router.use(requireBusiness);

router.post("/", async (req: Request, res: Response) => {
  const userId = getUserId(req)!;
  const businessId = req.businessId!;
  const rows = req.body?.rows;

  const { valid, errors } = validateImportRows(rows);

  if (valid.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `Import is capped at ${MAX_IMPORT_ROWS} rows at a time. Split it into batches.` });
  }
  if (valid.length === 0 && errors.length === 0) {
    return res.status(400).json({ error: "No rows to import." });
  }

  if (valid.length > 0) {
    await importRows(userId, businessId, valid);
  }

  res.json({ imported: valid.length, skipped: errors });
});

export default router;
