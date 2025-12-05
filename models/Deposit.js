// backend/models/Deposit.js
const mongoose = require("mongoose");

const depositSchema = new mongoose.Schema(
  {
    // 🔹 IMPORTANT: yahan ab userId nahi, sirf "user"
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    method: {
      type: String,
      enum: ["UPI", "Bank"],
      default: "UPI",
    },

    upiId: {
      type: String,
    },

    reference: {
      type: String, // UPI txn ID / remark / UTR
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    // 🎁 bonus info (agar use karna ho)
    bonusApplied: {
      type: Boolean,
      default: false,
    },

    bonusAmount: {
      type: Number,
      default: 0,
    },

    // 👥 referral commission tracking
    referralPaid: {
      type: Boolean,
      default: false,
    },
    level1Commission: {
      type: Number,
      default: 0,
    },
    level2Commission: {
      type: Number,
      default: 0,
    },
    level3Commission: {
      type: Number,
      default: 0,
    },

    // 📝 admin note (wallet.js me use ho raha hai)
    adminNote: {
      type: String,
    },
  },
  {
    timestamps: true,   // => createdAt + updatedAt auto
    versionKey: false,
  }
);

module.exports = mongoose.model("Deposit", depositSchema);
