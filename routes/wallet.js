// backend/routes/wallet.js
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Withdrawal = require("../models/Withdrawal");
const Deposit = require("../models/Deposit");

const router = express.Router();
const JWT_SECRET = "superSecretKeyChangeThis"; // SAME as auth.js

// ----------------- Middlewares -----------------
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, username, role }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}


// ---------- Deposit bonus helper ----------
function getDepositBonus(amount) {
  const a = Number(amount) || 0;

  if (a < 300) return 0;            // min deposit se kam => no bonus
  if (a < 1000) return Math.round(a * 0.03); // 300–999 => ~3%
  if (a < 5000) return Math.round(a * 0.05); // 1000–4999 => ~5%
  return Math.round(a * 0.08);               // 5000+ => ~8%
}




// ✅ Multi-level referral commission helper
async function awardReferralCommission(userDoc, amount, depositDoc) {
  try {
    // minimum deposit jiske upar referral lage
    if (amount < 500) return; // chhote deposits pe mat do, profit safe

    // Agar already pay ho chuka hai, dobara mat do
    if (depositDoc.referralPaid) return;

    // Level commissions
    const L1_RATE = 0.02;  // 2%
    const L2_RATE = 0.01;  // 1%
    const L3_RATE = 0.005; // 0.5%

    const mongoose = require("mongoose");
    const User = mongoose.model("User");

    let level1 = null;
    let level2 = null;
    let level3 = null;

    // Level 1 = jisne is user ko refer kiya
    if (userDoc.referredBy) {
      level1 = await User.findById(userDoc.referredBy);
    }

    // Level 2 = jisne level1 ko refer kiya
    if (level1 && level1.referredBy) {
      level2 = await User.findById(level1.referredBy);
    }

    // Level 3 = jisne level2 ko refer kiya
    if (level2 && level2.referredBy) {
      level3 = await User.findById(level2.referredBy);
    }

    let l1Amount = 0;
    let l2Amount = 0;
    let l3Amount = 0;

    // Helper to apply commission safely
    const applyCommission = (u, amt) => {
      if (!u || !amt || amt <= 0) return;
      u.balance += amt;
      
      // ⭐ lifetime referral income
      u.lifetimeReferralIncome = (u.lifetimeReferralIncome || 0) + amt;


      // 🔁 turnover rule: bonus se withdrawal easy na ho
      const requiredTurnover = amt * 5; // ex.: 5x of bonus as compulsory trade
      u.pendingTurnover = (u.pendingTurnover || 0) + requiredTurnover;
      u.hasActiveDeposit = true;
    };

    if (level1) {
      l1Amount = Math.floor(amount * L1_RATE);
      applyCommission(level1, l1Amount);
      await level1.save();
    }

    if (level2) {
      l2Amount = Math.floor(amount * L2_RATE);
      applyCommission(level2, l2Amount);
      await level2.save();
    }

    if (level3) {
      l3Amount = Math.floor(amount * L3_RATE);
      applyCommission(level3, l3Amount);
      await level3.save();
    }

    depositDoc.referralPaid = true;
    depositDoc.level1Commission = l1Amount;
    depositDoc.level2Commission = l2Amount;
    depositDoc.level3Commission = l3Amount;
    await depositDoc.save();
  } catch (err) {
    console.error("Referral commission error:", err);
  }
}


function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
}

/* ============================================================
   USER: Create deposit request
   POST /api/wallet/deposit
   body: { amount, method, upiId, reference }  // reference = UTR / txn id
============================================================ */
router.post("/deposit", authMiddleware, async (req, res) => {
  try {
    const { amount, method = "UPI", upiId, reference } = req.body;
    const parsedAmount = Number(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // ✅ MIN 300 RULE
    if (parsedAmount < 300) {
  return res
    .status(400)
    .json({ message: "Minimum deposit amount is ₹300." });
}

    if (method === "UPI" && !upiId) {
      return res.status(400).json({ message: "UPI ID is required." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isBlocked) {
      return res.status(403).json({ message: "User is blocked" });
    }

    // ❗ IMPORTANT:
    // Yahan sirf deposit request create ho rahi hai.
    // Balance abhi BILKUL bhi change nahi kar rahe.
    const d = await Deposit.create({
      user: user._id,
      amount: parsedAmount,
      method,
      upiId,
      reference,          // yahi UTR / UPI txn id hoga
      status: "PENDING",  // default bhi PENDING hi hona chahiye
    });

    // 🔁 Turnover / rollover logic (agar use kar raha hai to):
    // New real deposit => trading volume reset karo aur required turnover set karo
    user.hasActiveDeposit = true;
    user.tradeVolumeSinceLastDeposit = 0;
    // Example: 1x turnover rule -> jitna deposit, utna trade karna padega
    user.pendingTurnover = parsedAmount;
    await user.save();

    return res.json({
      message: "Deposit request created. Wait for admin approval.",
      deposit: {
        id: d._id.toString(),
        amount: d.amount,
        status: d.status,
        method: d.method,
        upiId: d.upiId,
        reference: d.reference,
        createdAt: d.createdAt,
      },
    });
  } catch (err) {
    console.error("Deposit error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});


/* ============================================================
   USER: My deposit history
============================================================ */
router.get("/deposit/my", authMiddleware, async (req, res) => {
  try {
    const list = await Deposit.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);

    return res.json(
      list.map((d) => ({
        id: d._id.toString(),
        amount: d.amount,
        status: d.status,
        method: d.method,
        upiId: d.upiId,
        reference: d.reference,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }))
    );
  } catch (err) {
    console.error("My deposits error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   ADMIN: List all deposit requests
============================================================ */
router.get(
  "/admin/deposit",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const list = await Deposit.find()
        .populate("user", "username customerId")
        .sort({ createdAt: -1 })
        .limit(100);

      return res.json(
        list.map((d) => ({
          id: d._id.toString(),
          user: {
            id: d.user._id.toString(),
            username: d.user.username,
            customerId: d.user.customerId,
          },
          amount: d.amount,
          status: d.status,
          method: d.method,
          upiId: d.upiId,
          reference: d.reference,
          adminNote: d.adminNote,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }))
      );
    } catch (err) {
      console.error("Admin deposit list error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// upar helper add kar chuke ho:
// async function awardReferralCommission(userDoc, amount, depositDoc) { ... }

router.post(
  "/admin/deposit/:id/status",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { status, adminNote } = req.body;
      const allowed = ["PENDING", "APPROVED", "REJECTED"];

      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const d = await Deposit.findById(req.params.id).populate("user");
      if (!d) return res.status(404).json({ message: "Not found" });

      // PENDING -> APPROVED => user ko balance credit + referral commission
      if (d.status === "PENDING" && status === "APPROVED") {
  const mainAmount = d.amount;

  // ✅ bonus slab yahin use kar
  const bonus = getDepositBonus(mainAmount);
  const creditAmount = mainAmount + bonus;

  d.user.balance += creditAmount;

  d.user.hasActiveDeposit = true;
  d.user.pendingTurnover =
    (d.user.pendingTurnover || 0) + creditAmount * 3; // 3x turnover
  d.user.tradeVolumeSinceLastDeposit = 0;

  await d.user.save();

  // multi-level referral commission (agar helper defined hai)
  await awardReferralCommission(d.user, mainAmount, d);

  d.bonusApplied = bonus > 0;
  d.bonusAmount = bonus;
}

      // PENDING -> REJECTED => koi balance change nahi
      d.status = status;
      if (adminNote) d.adminNote = adminNote;
      await d.save();

      return res.json({
        message: "Deposit status updated",
        status: d.status,
      });
    } catch (err) {
      console.error("Admin deposit status error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ============================================================
   USER: Create withdrawal request
   + turnover check yahi pe
============================================================ */
router.post("/withdraw", authMiddleware, async (req, res) => {
  try {
    const {
      amount,
      method = "UPI",
      upiId,
      bankName,
      bankAccount,
      ifsc,
    } = req.body;

    const amt = Number(amount);

    // 💰 basic amount validation
    if (!amt || amt <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // ✅ MINIMUM WITHDRAWAL RULE (ab 500)
    if (amt < 500) {
      return res
        .status(400)
        .json({ message: "Minimum withdrawal is ₹500" });
    }

    // ✅ Method wise validation
    if (method === "UPI") {
      if (!upiId) {
        return res
          .status(400)
          .json({ message: "UPI withdrawal ke liye UPI ID required hai." });
      }
    } else if (method === "Bank") {
      if (!bankName || !bankAccount || !ifsc) {
        return res.status(400).json({
          message:
            "Bank withdrawal ke liye bank name, account no. aur IFSC zaroori hai.",
        });
      }
    }

    // 👤 user fetch
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isBlocked) {
      return res.status(403).json({ message: "User is blocked" });
    }

    // 🔁 TURNOVER CONDITION YAHI HAI
    // jitna deposit hai (pendingTurnover), utna trade complete hona chahiye
    if (
      user.hasActiveDeposit &&
      user.pendingTurnover > 0 &&
      (user.tradeVolumeSinceLastDeposit || 0) < user.pendingTurnover
    ) {
      const remaining =
        user.pendingTurnover - (user.tradeVolumeSinceLastDeposit || 0);

      return res.status(400).json({
        message: `Withdraw se pehle kam se kam ₹${remaining} ka aur game turnover complete karo.`,
      });
    }

    // 💰 balance check
    if (user.balance < amt) {
      return res
        .status(400)
        .json({ message: "Insufficient balance for withdrawal" });
    }

    // 💸 Balance deduct
    user.balance -= amt;
    await user.save();

    // 🧾 withdrawal record create
    const w = await Withdrawal.create({
      user: user._id,
      amount: amt,
      method,
      upiId: method === "UPI" ? upiId : undefined,
      bankName: method === "Bank" ? bankName : undefined,
      bankAccount: method === "Bank" ? bankAccount : undefined,
      ifsc: method === "Bank" ? ifsc : undefined,
      status: "PENDING",
    });

    return res.json({
      message: "Withdrawal request created",
      withdrawal: {
        id: w._id.toString(),
        amount: w.amount,
        status: w.status,
        method: w.method,
        upiId: w.upiId,
        bankName: w.bankName,
        bankAccount: w.bankAccount,
        ifsc: w.ifsc,
        createdAt: w.createdAt,
      },
      balance: user.balance,
    });
  } catch (err) {
    console.error("Withdraw create error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});


/* ============================================================
   USER: My withdrawals
============================================================ */
router.get("/withdraw/my", authMiddleware, async (req, res) => {
  try {
    const list = await Withdrawal.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);

    return res.json(
  list.map((w) => ({
    id: w._id.toString(),
    amount: w.amount,
    status: w.status,
    method: w.method,
    upiId: w.upiId,
    bankName: w.bankName,
    bankAccount: w.bankAccount,
    ifsc: w.ifsc,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }))
);

  } catch (err) {
    console.error("My withdrawals error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   ADMIN: List all withdrawals
============================================================ */
router.get(
  "/admin/withdraw",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const list = await Withdrawal.find()
        .populate("user", "username customerId")
        .sort({ createdAt: -1 })
        .limit(100);

      return res.json(
  list.map((w) => ({
    id: w._id.toString(),
    user: {
      id: w.user._id.toString(),
      username: w.user.username,
      customerId: w.user.customerId,
    },
    amount: w.amount,
    status: w.status,
    method: w.method,
    upiId: w.upiId,
    bankName: w.bankName,
    bankAccount: w.bankAccount,
    ifsc: w.ifsc,
    adminNote: w.adminNote,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }))
);

    } catch (err) {
      console.error("Admin withdraw list error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ============================================================
   ADMIN: Update withdrawal status (PAID / REJECTED)
============================================================ */
router.post(
  "/admin/withdraw/:id/status",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { status, adminNote } = req.body;
      const allowed = ["PENDING", "PAID", "REJECTED"];

      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const w = await Withdrawal.findById(req.params.id).populate("user");
      if (!w) return res.status(404).json({ message: "Not found" });

      // PENDING -> REJECTED => refund balance
      if (w.status === "PENDING" && status === "REJECTED") {
        w.user.balance += w.amount;
        await w.user.save();
      }

      w.status = status;
      if (adminNote) w.adminNote = adminNote;
      await w.save();

      return res.json({
        message: "Withdrawal status updated",
        status: w.status,
      });
    } catch (err) {
      console.error("Admin withdraw status error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
