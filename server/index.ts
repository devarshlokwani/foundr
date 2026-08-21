import "dotenv/config";
// Must load before any router is defined — patches Express so a rejected
// promise inside an async route handler reaches the error middleware below
// instead of becoming an unhandled rejection that crashes the whole
// process (Express 4 doesn't await async handlers on its own).
import "express-async-errors";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { connectDB } from "./db.js";
import transactionsRouter from "./routes/transactions.js";
import investmentsRouter from "./routes/investments.js";
import milestonesRouter from "./routes/milestones.js";
import metricsRouter from "./routes/metrics.js";
import categoriesRouter from "./routes/categories.js";
import insightsRouter from "./routes/insights.js";
import entriesRouter from "./routes/entries.js";
import settingsRouter from "./routes/settings.js";
import reportsRouter from "./routes/reports.js";
import drawsRouter from "./routes/draws.js";
import debtsRouter from "./routes/debts.js";
import businessesRouter from "./routes/businesses.js";
import recurringRouter from "./routes/recurring.js";

/**
 * Foundr API server.
 *
 * Startup order matters:
 *   1. Connect to MongoDB (exits if it can't).
 *   2. Wire Clerk middleware so every request carries auth info.
 *   3. Mount the API routes (each one requires a signed-in user).
 *
 * The frontend (Vite, port 5173) talks to this on port 3000; Vite's dev
 * proxy forwards /api calls here, so the browser sees one origin.
 */

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Reads the Clerk session token on every request and attaches auth.
app.use(clerkMiddleware());

// Health check — handy for confirming the server is up.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "foundr-api" });
});

app.use("/api/transactions", transactionsRouter);
app.use("/api/investments", investmentsRouter);
app.use("/api/milestones", milestonesRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/entries", entriesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/draws", drawsRouter);
app.use("/api/debts", debtsRouter);
app.use("/api/businesses", businessesRouter);
app.use("/api/recurring", recurringRouter);

// Catches anything a route threw or rejected with (now forwarded here by
// express-async-errors) so one bad request returns a clean 500 instead of
// taking the whole API down for every founder using it.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] Unhandled route error:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong on our end. Please try again." });
});

// Last-resort net for anything outside the request/response cycle (a
// stray unawaited promise, a bug in a library's own background code) —
// log it instead of letting Node's default behaviour kill the process.
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err);
});

async function start(): Promise<void> {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[server] Foundr API running on http://localhost:${PORT}`);
  });
}

start();