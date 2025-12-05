// server.js (safe, guarded exits + heartbeat for debug)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

// Routes import
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const gameRoutes = require("./routes/game");
const walletRoutes = require("./routes/wallet");
const referralRoutes = require("./routes/referral");

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "*",
    credentials: true,
  })
);

// Helper: guarded exit so production doesn't auto-exit during debugging.
// To allow real exits set env ALLOW_EXIT=1 (only for maintenance scripts).
function guardedExit(code = 1) {
  if (process.env.ALLOW_EXIT === "1") {
    console.error("guardedExit: ALLOW_EXIT=1 -> exiting with", code);
    process.exit(code);
  } else {
    console.error("guardedExit blocked exit (ALLOW_EXIT != 1). Code:", code);
    // keep process alive for debugging — do not exit
  }
}

// --- MONGO URI check ---
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("FATAL: MONGO_URI is missing. Set MONGO_URI env var.");
  // previously abrupt process.exit(1) was here — now guarded
  guardedExit(1);
}

// Masked log for security
try {
  const masked = MONGO_URI.replace(/(\/\/.+?:).+?@/, "$1***@");
  console.log("Connecting to MongoDB (masked):", masked);
} catch (e) {
  console.log("Connecting to MongoDB");
}

// Connect to MongoDB (no deprecated options)
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    guardedExit(1);
  });

// Basic health route
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/referral", referralRoutes);

// Start server: use PORT from env and bind 0.0.0.0
const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Heartbeat (temporary) to make sure container remains alive and visible in logs.
setInterval(() => {
  console.log("🫀 Heartbeat: server alive at", new Date().toISOString());
}, 30 * 1000);

// Helpful global handlers (don't exit immediately — log and let guardedExit handle)
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  guardedExit(1);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  guardedExit(1);
});
