// backend/razorpay.js
const Razorpay = require("razorpay");

console.log("LOADED KEY:", process.env.RAZORPAY_KEY_ID);


const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

module.exports = razorpayInstance;
