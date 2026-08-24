import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { WaitlistModel } from "./models/Waitlist.js";

/**
 * Foundr waitlist server: tiny standalone API for the pre-launch landing
 * page. No auth, no Clerk, just email capture.
 */

const app = express();
const PORT = process.env.PORT || 3001;

// Behind Render's proxy, trust it so rate-limiting sees real client IPs.
app.set("trust proxy", 1);

app.use(cors({ origin: process.env.WAITLIST_ORIGIN || true }));
app.use(express.json());

/**
 * Rate limit the signup endpoint: at most 7 requests per IP per 15 min.
 * Plenty for a real person (who submits once), but stops anyone flooding
 * the database with junk from a single source.
 */
const waitlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 7,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a little while." },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "foundr-waitlist" });
});

app.post("/api/waitlist", waitlistLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  try {
    await WaitlistModel.create({ email: email.toLowerCase().trim() });
    return res.status(201).json({ ok: true });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000) {
      return res.status(200).json({ ok: true, already: true });
    }
    console.error("[waitlist] error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

async function start(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error("[waitlist] MONGODB_URI is not set."); process.exit(1); }
  try {
    await mongoose.connect(uri);
    console.log("[waitlist] Connected to MongoDB");
  } catch (err) {
    console.error("[waitlist] Failed to connect to MongoDB:", err);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`[waitlist] Foundr waitlist API running on http://localhost:${PORT}`);
  });
}

start();