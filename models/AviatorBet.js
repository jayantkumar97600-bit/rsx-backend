// backend/models/AviatorBet.js
const mongoose = require("mongoose");

const aviatorBetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    period: { type: String, required: true, index: true },

    amount: { type: Number, required: true },
    autoCashoutX: { type: Number, default: null }, // e.g. 1.50x

    // settlement
    settled: { type: Boolean, default: false },
    win: { type: Boolean, default: false },
    profit: { type: Number, default: 0 },
    cashoutAtX: { type: Number, default: null }, // jis multiplier pe consider hua
    balanceAfter: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AviatorBet", aviatorBetSchema);
