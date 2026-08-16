import "dotenv/config";
import express from "express";
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

async function start(): Promise<void> {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[server] Foundr API running on http://localhost:${PORT}`);
  });
}

start();