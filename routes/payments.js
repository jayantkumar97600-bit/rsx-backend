// backend/routes/payments.js
const express = require("express");
const crypto = require("crypto");
const razorpay = require("../razorpay");
const Payment = require("../models/Payment");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

const router = express.Router();

/* Create Razorpay order */
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const parsed = Number(amount);

    if (!parsed || parsed <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const options = {
      amount: parsed * 100, // paise
      currency: "INR",
      receipt: "dep_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    await Payment.create({
      userId: req.user.id,
      amount: parsed,
      status: "PENDING",
      razorpayOrderId: order.id,
    });

    return res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      order,
    });
  } catch (err) {
    console.error("Order error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create payment order" });
  }
});

/* Verify Razorpay payment */
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const signString = razorpay_order_id + "|" + razorpay_payment_id;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(signString)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment signature" });
    }

    const payment = await Payment.findOne({
      razorpayOrderId: razorpay_order_id,
      userId: req.user.id,
    });

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment record not found" });
    }

    payment.razorpayPaymentId = razorpay_payment_id;
    await payment.save();

    return res.json({
      success: true,
      status: "PENDING",
      message: "Payment verified. Waiting for admin approval.",
    });
  } catch (err) {
    console.error("Verify error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Payment verify failed" });
  }
});

/* (Optional) admin — see pending deposits */
router.get("/pending", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const list = await Payment.find({ status: "PENDING" })
      .sort({ createdAt: -1 })
      .populate("userId", "username customerId");

    return res.json(
      list.map((p) => ({
        id: p._id.toString(),
        user: p.userId,
        amount: p.amount,
        razorpayOrderId: p.razorpayOrderId,
        razorpayPaymentId: p.razorpayPaymentId,
        status: p.status,
        createdAt: p.createdAt,
      }))
    );
  } catch (err) {
    console.error("Pending deposits error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
});

module.exports = router;
