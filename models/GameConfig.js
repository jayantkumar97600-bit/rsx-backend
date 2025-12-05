// backend/models/GameConfig.js
const mongoose = require("mongoose");

const gameConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      required: true,
    },

    // Master switch: profit-controlled RNG on/off
    profitMode: {
      type: Boolean,
      default: true,
    },

    // New users ko thoda zyada win chance
    newUserBoost: {
      type: Boolean,
      default: true,
    },

    // Turnover / withdrawal restriction ke time thoda risk
    withdrawalRisk: {
      type: Boolean,
      default: true,
    },

    // Bade bets ke liye extra risk
    bigBetRisk: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GameConfig", gameConfigSchema);
