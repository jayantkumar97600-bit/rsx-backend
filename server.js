// server.js

// .env load karo (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET etc.)
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

// Routes import
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const gameRoutes = require("./routes/game"); // 👈 NEW GAME ROUTES
const walletRoutes = require("./routes/wallet");
const referralRoutes = require("./routes/referral");






const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ⭐ CONNECT MONGODB
mongoose
  .connect("mongodb://127.0.0.1:27017/godwin")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Test route
app.get("/", (req, res) => {
  res.json({ message: "API is running" });
});

// Routes
app.use("/api/auth", authRoutes);        // login/register/balance/trades
app.use("/api/payments", paymentRoutes); // Razorpay deposit routes
app.use("/api/game", gameRoutes);        // 👈 NEW: RSX WINGOD game routes
app.use("/api/wallet", walletRoutes);
app.use("/api/referral", referralRoutes);


// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
