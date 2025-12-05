// server.js (use this exact code — CommonJS style)
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

// Body + CORS
app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "*",
    credentials: true,
  })
);

// --- fail-fast: ensure MONGO_URI exists in env ---
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error(
    "FATAL: MONGO_URI is missing. Set MONGO_URI in environment variables and restart."
  );
  // exit so Railway shows clear failure logs (do not continue with localhost fallback)
  process.exit(1);
}

// Connect mongoose using MONGO_URI from env
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Basic health route
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Other API routes
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

// Global error handlers (helpful logs)
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
