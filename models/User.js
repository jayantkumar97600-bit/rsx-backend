const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // Display name
    username: {
      type: String,
      required: true,
      trim: true,
    },

    // Login via mobile
    mobile: {
      type: String,
      unique: true,
      sparse: true, // purane users ke liye null allow
    },

    passwordHash: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },

    balance: {
      type: Number,
      default: 0,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    customerId: {
      type: String,
      unique: true,
      sparse: true,
    },

    // Referral system
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    signupBonusGiven: {
      type: Boolean,
      default: false,
    },

        lifetimeReferralIncome: {
      type: Number,
      default: 0,
    },


    // Turnover / rollover logic
    tradeVolumeSinceLastDeposit: {
      type: Number,
      default: 0,
    },

    pendingTurnover: {
      type: Number,
      default: 0, // itna amount trade karna hai withdrawal se pehle
    },

    hasActiveDeposit: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
