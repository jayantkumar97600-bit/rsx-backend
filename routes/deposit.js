const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const Deposit = require("../models/Deposit");
const User = require("../models/User");
const auth = require("../middleware/auth");


// ========= FILE UPLOAD (screenshot for proof) =========
const uploadDir = path.join(__dirname, "../public/uploads");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `deposit_${ts}${ext}`);
  }
});
const upload = multer({ storage });


// =========== CREATE DEPOSIT REQUEST ===========
router.post("/initiate", auth, upload.single("proof"), async (req, res) => {
  try {
    const { amount, reference, upiId } = req.body;

    if (!amount || Number(amount) <= 0)
      return res.status(400).json({ message: "Invalid amount" });

    const deposit = new Deposit({
      user: req.user._id,
      amount: Number(amount),
      method: "UPI",
      upiId: upiId || null,
      reference: reference || null,
      status: "PENDING",
    });

    if (req.file) {
      deposit.proofUrl = `/uploads/${req.file.filename}`;
    }

    await deposit.save();

    res.json({
      message: "Deposit submitted, pending admin verification",
      depositId: deposit._id,
    });
  } catch (e) {
    console.error("Deposit error:", e);
    res.status(500).json({ message: "Server error" });
  }
});


// =========== USER KE APNE DEPOSITS ===========
router.get("/mine", auth, async (req, res) => {
  try {
    const list = await Deposit.find({ user: req.user._id })
      .sort({ createdAt: -1 });

    res.json(list);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});


// =========== ADMIN: APPROVE DEPOSIT ===========
router.patch("/:id/approve", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Not allowed" });

    const dep = await Deposit.findById(req.params.id);
    if (!dep) return res.status(404).json({ message: "Deposit not found" });

    dep.status = "APPROVED";
    dep.adminNote = req.body.note || "";
    await dep.save();

    // UPI success → user wallet credit
    const user = await User.findById(dep.user);
    user.balance += dep.amount;
    await user.save();

    res.json({ message: "Deposit approved & wallet credited" });

  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});


// =========== ADMIN: REJECT DEPOSIT ===========
router.patch("/:id/reject", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Not allowed" });

    const dep = await Deposit.findById(req.params.id);
    if (!dep) return res.status(404).json({ message: "Deposit not found" });

    dep.status = "REJECTED";
    dep.adminNote = req.body.note || "";
    await dep.save();

    res.json({ message: "Deposit rejected" });

  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
