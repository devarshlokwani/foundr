import mongoose from "mongoose";

/**
 * Connects to MongoDB using the connection string in MONGODB_URI.
 * Called once at server startup. Exits the process if the connection
 * fails, since the app can't function without the database.
 */
export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("[db] MONGODB_URI is not set. Add it to your .env file.");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log("[db] Connected to MongoDB");
  } catch (err) {
    console.error("[db] Failed to connect to MongoDB:", err);
    process.exit(1);
  }
}