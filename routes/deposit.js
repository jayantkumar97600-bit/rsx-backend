// backend/routes/deposit.js
const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");
const Deposit = require("../models/Deposit");
const User = require("../models/User");

// Try to require auth middleware safely
let auth;
try {
  auth = require("../middleware/auth");
} catch (e) {
  console.warn("auth middleware not found or failed to load — continuing without auth. Error:", e.message);
  auth = null;
}

// Helper: ensure middleware is a function or fallback to passthrough
const maybeAuth = (mode = "required") => {
  // mode: "required" -> if auth missing, respond 401
  // mode: "optional" -> if auth missing, just pass next()
  if (auth && typeof auth === "function") return auth;
  // sometimes auth exports an object with methods like auth.optional/adminOnly etc.
  if (auth && typeof auth === "object") {
    if (mode === "optional" && typeof auth.optional === "function") return auth.optional;
    if (mode === "adminOnly" && typeof auth.adminOnly === "function") return auth.adminOnly;
    if (typeof auth.default === "function") return auth.default;
  }
  // fallback
  if (mode === "required") {
    return (req, res, next) => {
      // if you want to require auth but auth is unavailable, return 401 to avoid silent behavior
      return res.status(401).json({ message: "Auth middleware not available on server" });
    };
  }
  return (req, res, next) => next();
};


// ========== multer config (uploads) ==========
const uploadDir = path.join(__dirname, "../public/uploads");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `deposit_${ts}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024 } }); // 3MB max


// ========== POST /api/deposit/initiate =========
// Use optional auth (so guests can still submit proof if you want)
router.post("/initiate", maybeAuth("optional"), upload.single("proof"), async (req, res) => {
  try {
    const { amount, reference, upiId } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const depositData = {
      amount: Number(amount),
      method: "UPI",
      upiId: upiId || null,
      reference: reference || null,
      status: "PENDING",
    };

    if (req.user && req.user._id) depositData.user = req.user._id;

    if (req.file) {
      depositData.proofUrl = `/uploads/${req.file.filename}`;
    }

    const deposit = new Deposit(depositData);
    await deposit.save();

    return res.json({ message: "Deposit submitted, pending admin verification", depositId: deposit._id });
  } catch (e) {
    console.error("Deposit initiate error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});


// ========== GET /api/deposit/mine =========
router.get("/mine", maybeAuth("required"), async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const list = await Deposit.find({ user: userId }).sort({ createdAt: -1 }).limit(100);
    res.json(list);
  } catch (e) {
    console.error("Deposit list error:", e);
    res.status(500).json({ message: "Server error" });
  }
});


// ========== ADMIN APPROVE ==========
router.patch("/:id/approve", maybeAuth("required"), async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") return res.status(403).json({ message: "Not allowed" });

    const dep = await Deposit.findById(req.params.id);
    if (!dep) return res.status(404).json({ message: "Deposit not found" });

    dep.status = "APPROVED";
    dep.adminNote = req.body.note || "";
    await dep.save();

    // credit user
    if (dep.user) {
      const user = await User.findById(dep.user);
      if (user) {
        user.balance = (user.balance || 0) + dep.amount;
        await user.save();
      }
    }

    res.json({ message: "Approved and user credited" });
  } catch (e) {
    console.error("Approve error:", e);
    res.status(500).json({ message: "Server error" });
  }
});


// ========== ADMIN REJECT ==========
router.patch("/:id/reject", maybeAuth("required"), async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") return res.status(403).json({ message: "Not allowed" });

    const dep = await Deposit.findById(req.params.id);
    if (!dep) return res.status(404).json({ message: "Deposit not found" });

    dep.status = "REJECTED";
    dep.adminNote = req.body.note || "";
    await dep.save();

    res.json({ message: "Rejected" });
  } catch (e) {
    console.error("Reject error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
