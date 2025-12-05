const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // pehle ka data
    roundId: { type: Number, required: true },

    // NEW: game mode & period -> sabko same period dikhega
    gameType: {
      type: String,
      enum: ["30s", "60s", "180s", "300s"],
      default: "30s",
      required: true,
    },

    period: {
      type: String, // e.g. "30s-1234567"
      required: true,
      index: true,
    },

    // NEW: bet classification
    betKind: {
      type: String,
      enum: ["color", "number", "size"], // color=G/R/V, number=0..9, size=SMALL/BIG
      required: true,
    },

    betValue: {
      type: String, // "G", "R", "V", "0".."9", "SMALL", "BIG"
      required: true,
    },

    amount: { type: Number, required: true },

    // result
    resultColor: { type: String }, // "G","R","V" (optional, depending on type)
    resultNumber: { type: Number }, // 0–9

    win: { type: Boolean, default: false },
    profit: { type: Number, default: 0 },

    balanceAfter: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);
