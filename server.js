// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const gameRoutes = require("./routes/game");
const walletRoutes = require("./routes/wallet");
const referralRoutes = require("./routes/referral");

const app = express();
app.use(cors());
app.use(express.json());

// Simple health endpoint for Railway healthcheck
app.get("/health", (req, res) => res.status(200).send("ok"));

// Basic root route
app.get("/", (req, res) => res.json({ message: "API is running" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/referral", referralRoutes);

// Mongo connection with retry (won't call process
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/godwin";

async function connectWithRetry(retries = 5, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log("Connecting to MongoDB (masked):", maskUri(MONGO_URI));
      await mongoose.connect(MONGO_URI, {
        // do not pass deprecated options
        // mongoose 7+ no longer needs useNewUrlParser/useUnifiedTopology flags
      });
      console.log("✅ MongoDB Connected");
      return;
    } catch (err) {
      console.error(`Mongo connect attempt ${i + 1} failed:`, err.message || err);
      if (i < retries - 1) {
        console.log(`Waiting ${delayMs}ms before retry...`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.error("Could not connect to MongoDB after retries — continuing without exiting. Requests will fail until DB is available.");
        // do NOT process here — let the container stay alive so Railway healthcheck can observe /health
        return;
      }
    }
  }
}

function maskUri(uri) {
  try {
    if (!uri) return "(empty)";
    const s = uri.replace(/(:\/\/)([^:\/]+):([^@]+)@/, "$1$2:***@");
    return s;
  } catch {
    return "(masked)";
  }
}

// start server AFTER attempting connection (but even if mongodb not connected we keep server alive)
const PORT = Number(process.env.PORT) || 5000;

connectWithRetry(5, 3000).finally(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});

// keep process alive on unhandled rejections — log but don't exit
process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at:", p, "reason:", reason);
});

// log uncaught exceptions but do not immediately exit (you can choose to exit after graceful cleanup)
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
