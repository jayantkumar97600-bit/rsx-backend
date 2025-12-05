const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    method: {
      type: String,
      enum: ["UPI", "Bank", "Other"],
      default: "UPI",
    },
    upiId: {
      type: String,
    },

    // ✅ Bank ke liye
    bankName: { type: String },
    bankAccount: { type: String },
    ifsc: { type: String },

    status: {
      type: String,
      enum: ["PENDING", "REJECTED", "PAID"],
      default: "PENDING",
    },
    adminNote: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Withdrawal", withdrawalSchema);
