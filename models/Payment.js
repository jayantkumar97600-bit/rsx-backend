// backend/models/Payment.js
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    amount: { type: Number, required: true },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    method: { type: String, default: "Razorpay" },

    razorpayOrderId: String,
    razorpayPaymentId: String,

    note: String,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
