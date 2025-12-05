// backend/models/RoundResult.js
const mongoose = require("mongoose");

const roundResultSchema = new mongoose.Schema(
  {
    gameType: {
      type: String,
      enum: ["30s", "60s", "180s", "300s"],
      required: true,
    },

    period: {
      type: String, // e.g. "30s-1234567"
      required: true,
    },

    // final outcome
    resultNumber: {
      type: Number, // 0–9
      required: true,
    },
    resultColor: {
      type: String, // "G","R","V"
      required: true,
    },

    forcedByAdmin: {
      type: Boolean,
      default: false,
    },
    setBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

roundResultSchema.index({ gameType: 1, period: 1 }, { unique: true });

module.exports = mongoose.model("RoundResult", roundResultSchema);
