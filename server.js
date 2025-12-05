// server.js
require("dotenv").config(); // load .env in local / Railway injects env too

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

// optional logger, install if used (npm i morgan)
// const morgan = require("morgan");

const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const gameRoutes = require("./routes/game");
const walletRoutes = require("./routes/wallet");
const referralRoutes = require("./routes/referral");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
// app.use(morgan("dev")); // uncomment if you have morgan installed

// Basic health / root endpoint (important for Railway healthcheck)
app.get("/", (req, res) => {
  res.status(200).send("Backend is live");
});

// Optional explicit health endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", time: new Date().toISOString() });
});

// Mongo connect using env var
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO || "mongodb://127.0.0.1:27017/godwin";

mongoose
  .connect(MONGO_URI, {
    // Mongoose 7+ doesn't need useNewUrlParser/useUnifiedTopology
    // keep options minimal
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    // don't exit immediately — allow Railway to see error and restart as per policy
  });

// Routes (mounted)
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/referral", referralRoutes);

// Use dynamic port for cloud providers
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown handlers (helps prevent container exit loops)
function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    mongoose.disconnect().finally(() => {
      console.log("Closed out remaining connections.");
      process.exit(0);
    });
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = app;
