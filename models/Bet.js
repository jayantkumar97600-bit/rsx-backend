// backend/models/Bet.js
const mongoose = require("mongoose");

const betSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 30s, 60s, 180s, 300s
    gameType: {
      type: String,
      enum: ["30s", "60s", "180s", "300s"],
      default: "30s",
      required: true,
    },

    // same period for all users in that gameType
    period: {
      type: String, // e.g. "30s-1234567"
      required: true,
      index: true,
    },

    // "color" | "number" | "size"
    betKind: {
      type: String,
      enum: ["color", "number", "size"],
      required: true,
    },

    // "G","R","V" | "0".."9" | "SMALL"/"BIG"
    betValue: {
      type: String,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    // result info (filled after settlement)
    resultNumber: { type: Number }, // 0–9
    resultColor: { type: String },  // "G","R","V"
    resultSize: { type: String },   // "SMALL","BIG"

    win: { type: Boolean, default: false },
    profit: { type: Number, default: 0 },

    settled: { type: Boolean, default: false },

    balanceAfter: { type: Number }, // user balance after settlement
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bet", betSchema);
