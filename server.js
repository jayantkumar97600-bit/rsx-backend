// server.js - RSX WINGOD backend (clean & production-friendly)

require("dotenv").config();

const express = require("express");
let morgan;
try {
  morgan = require("morgan");
} catch (e) {
  // morgan missing -> it's optional (avoid crash on platforms where devDependencies aren't installed)
  morgan = null;
}

const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

// Route imports (ensure these files exist and export routers)
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const gameRoutes = require("./routes/game");
const walletRoutes = require("./routes/wallet");
const referralRoutes = require("./routes/referral");
const depositRoutes = require("./routes/deposit");


const app = express();

// Middleware
app.use(cors());
app.use(express.json());
if (morgan) app.use(morgan("tiny"));

// Basic healthcheck (use this path in Railway healthcheck)
app.get("/healthz", (req, res) => res.status(200).json({ ok: true, time: new Date().toISOString() }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/deposit", depositRoutes);
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// If you later serve frontend from same server:
// app.use(express.static(path.join(__dirname, "public")));
// app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));

const PORT = Number(process.env.PORT || 8080);

// MONGO URI from env (set this in Railway / host env vars)
const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || "mongodb://127.0.0.1:27017/rsxwingod";

let server = null;

// Connect to Mongo and start server
async function start() {
  try {
    console.log(`Connecting to MongoDB: ${MONGO_URI.includes("mongodb+srv") ? "atlas uri (masked)" : MONGO_URI}`);
    await mongoose.connect(MONGO_URI /* no deprecated options here */);
    console.log("✅ MongoDB Connected");

    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    // If the platform sends SIGTERM, we gracefully close
    setupGracefulShutdown();
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    // Do not force process.exit here — let platform attempt restart and logs show the error.
    // If you want to exit after repeated failures, implement backoff here.
  }
}

function setupGracefulShutdown() {
  const graceful = async (signal) => {
    try {
      console.log(`⚠️  Received ${signal}. Shutting down gracefully...`);
      if (server) {
        await new Promise((resolve) => server.close(resolve));
        console.log("HTTP server closed.");
      }
      // Close mongoose connection
      try {
        await mongoose.connection.close(false);
        console.log("Mongo connection closed.");
      } catch (e) {
        console.warn("Error closing Mongo connection:", e);
      }
    } catch (e) {
      console.error("Error during graceful shutdown:", e);
    } finally {
      // Exit with 0 so platform knows it was graceful (use non-zero on unexpected failure)
      process.exit(0);
    }
  };

  // Hook into the standard signals
  process.on("SIGTERM", () => graceful("SIGTERM"));
  process.on("SIGINT", () => graceful("SIGINT"));

  // Catch unhandled promises so we can log (optional)
  process.on("unhandledRejection", (reason, p) => {
    console.error("Unhandled Rejection at: Promise", p, "reason:", reason);
    // don't exit immediately; platform/logic can decide
  });
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    // prefer graceful shutdown on uncaught exception if possible
    graceful("uncaughtException");
  });
}

start();
