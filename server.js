// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const morgan = require("morgan"); // optional: request logging

// routes (ensure these files exist & export router)
// if any route file missing, comment import until you add file
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const gameRoutes = require("./routes/game");
const walletRoutes = require("./routes/wallet");
const referralRoutes = require("./routes/referral");

const app = express();

// Basic middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan?.("tiny"));

// Simple health endpoints (Railway / platform will call these)
app.get("/", (req, res) => res.json({ ok: true, message: "API is running" }));
app.get("/health", (req, res) =>
  res.json({ ok: true, timestamp: new Date().toISOString() })
);

// Mount routes (prefixes)
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/referral", referralRoutes);

// fallback 404
app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

/* -------------------------
   Mongoose connection
   ------------------------- */
const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || "";
if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set. Set process.env.MONGO_URI and restart.");
  // Don't throw here — just keep logging and allow process to start so platform shows logs.
}

async function connectMongo() {
  try {
    // mongoose v7+ doesn't need useNewUrlParser/useUnifiedTopology options.
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    // Do not exit immediately; platform will show logs. We'll retry using mongoose built-in reconnect logic.
  }
}

// call connect
connectMongo();

/* -------------------------
   Start server
   ------------------------- */
const PORT = Number(process.env.PORT || 5000);

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  // show a masked connection log if needed
  if (MONGO_URI) {
    try {
      const masked = MONGO_URI.replace(/(\/\/)(.*):(.*)@/, "$1<user>:<pw>@");
      console.log("Connecting to MongoDB (masked):", masked.split("?")[0] + (MONGO_URI.includes("?") ? "/?..." : ""));
    } catch (e) {}
  }
});

/* -------------------------
   Graceful shutdown
   ------------------------- */
const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);
  try {
    if (server) {
      server.close(() => {
        console.log("HTTP server closed.");
      });
    }
    // close mongoose connection
    await mongoose.connection.close(false);
    console.log("Mongo connection closed.");
    // give platform a short moment then exit
    setTimeout(() => {
      console.log("Exiting process.");
      process.exit(0);
    }, 500);
  } catch (err) {
    console.error("Error during graceful shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

/* -------------------------
   Uncaught handlers (log-only)
   ------------------------- */
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  // don't exit immediately; platform will restart if needed
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
  // keep running to allow debugging, platform can restart container later
});
