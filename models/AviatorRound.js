// backend/models/AviatorRound.js
const mongoose = require("mongoose");

const aviatorRoundSchema = new mongoose.Schema(
  {
    period: { type: String, unique: true, index: true },
    crashMultiplier: { type: Number, required: true }, // e.g. 1.23
  },
  { timestamps: true }
);

module.exports = mongoose.model("AviatorRound", aviatorRoundSchema);
