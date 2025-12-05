// backend/routes/auth.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const router = express.Router();





const JWT_SECRET = "superSecretKeyChangeThis"; // SAME as game.js, wallet.js

// ---------------- JWT helper ----------------
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ---------------- customerId helper (UNIQUE) ----------------
async function ensureCustomerId(user) {
  // agar already hai to kuch mat karo
  if (user.customerId) return user;

  // 1) pehle _id se based id banate hain (unique hone ka high chance)
  let cid = "GW" + user._id.toString().slice(-6).toUpperCase();
  user.customerId = cid;

  try {
    await user.save();
    return user;
  } catch (err) {
    // agar duplicate ho gaya to random se try karenge
    if (err.code === 11000) {
      let saved = false;
      for (let i = 0; i < 5 && !saved; i++) {
        cid =
          "GW" +
          Math.floor(Math.random() * 1000000)
            .toString()
            .padStart(6, "0");
        user.customerId = cid;
        try {
          await user.save();
          saved = true;
        } catch (e2) {
          if (e2.code !== 11000) {
            throw e2;
          }
        }
      }
      if (!saved) throw err;
      return user;
    }
    throw err;
  }
}

// ---------------- referralCode helper (optional) ----------------
async function ensureReferralCode(user) {
  if (user.referralCode) return user;

  try {
    user.referralCode =
      "RSX" + user._id.toString().slice(-6).toUpperCase();
    await user.save();
    return user;
  } catch (err) {
    // agar duplicate ho bhi gaya to chhod do, error se app na toote
    if (err.code === 11000) {
      return user;
    }
    throw err;
  }
}

/* ======================================================================
   REGISTER  → mobile + password, auto username, signup bonus
====================================================================== */
// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { mobile, password, referralCode } = req.body;

    // basic validation
    if (!mobile || !password) {
      return res
        .status(400)
        .json({ message: "Mobile number and password required." });
    }

    const cleanMobile = String(mobile).trim();

    // mobile already used? => error + bolo login karo
    const existing = await User.findOne({ mobile: cleanMobile });
    if (existing) {
      return res
        .status(400)
        .json({ message: "This mobile number is already registered. Please login." });
    }

    // password hash
    const passwordHash = await bcrypt.hash(password, 10);

    // agar referralCode aaya hai to referrer dhundo
    let referredByUser = null;
    if (referralCode && referralCode.trim() !== "") {
      referredByUser = await User.findOne({
        $or: [
          { referralCode: referralCode.trim() },
          { customerId: referralCode.trim() },
        ],
      });
    }

    // naya user object (username = mobile)
    let user = new User({
      username: cleanMobile,
      mobile: cleanMobile,
      passwordHash,
      role: "user",
    });

    if (referredByUser) {
      user.referredBy = referredByUser._id;
    }

    // ✅ Signup bonus agar referral se aaya hai
    let signupBonus = 0;
    if (referredByUser && !user.signupBonusGiven) {
      signupBonus = 100; // chahe to yahan change kar sakta hai

      user.balance += signupBonus;
      user.signupBonusGiven = true;

      // turnover restriction me daal diya (3x)
      user.hasActiveDeposit = true;
      user.pendingTurnover =
        (user.pendingTurnover || 0) + signupBonus * 3;
      user.tradeVolumeSinceLastDeposit = 0;
    }

    await user.save();

    // customerId + referralCode ensure
    await ensureCustomerId(user);
    await ensureReferralCode(user);

    // JWT token generate (same helper)
    const token = generateToken({
      id: user._id.toString(),
      username: user.username,
      role: user.role,
    });

    return res.status(200).json({
      message: referredByUser
        ? `Account created with referral bonus ₹${signupBonus}.`
        : "Account created.",
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        balance: user.balance,
        customerId: user.customerId,
        referralCode: user.referralCode,
        mobile: user.mobile,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    return res
      .status(500)
      .json({ message: "Server error during registration." });
  }
});


/* ======================================================================
   LOGIN  (+ dev backdoor: superadmin / gw1234)
   - Frontend se hum loginId bhejenge (mobile ya username)
====================================================================== */
router.post("/login", async (req, res) => {
  try {
    const { username, mobile, password } = req.body;

    // ⭐ Dev backdoor admin (username = superadmin)
    if (username === "superadmin" && password === "3dfgauGLA#") {
      const devUser = {
        id: "999",
        username: "superadmin",
        role: "admin",
        balance: 999999,
        customerId: "GWDEV999999",
        createdAt: new Date(),
      };
      const token = generateToken(devUser);
      return res.json({
        message: "Dev admin login successful",
        token,
        user: devUser,
      });
    }

    let user = null;

    if (mobile) {
      user = await User.findOne({ mobile });
    }
    if (!user && username) {
      user = await User.findOne({ username });
    }

    if (!user) {
      return res.status(400).json({ message: "Invalid login details" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "User is blocked" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(400).json({ message: "Invalid login details" });
    }

    // safe customerId + referralCode
    await ensureCustomerId(user);
    await ensureReferralCode(user);

    const token = generateToken({
      id: user._id.toString(),
      username: user.username,
      role: user.role,
    });

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        balance: user.balance,
        customerId: user.customerId,
        createdAt: user.createdAt,
        mobile: user.mobile,
        referralCode: user.referralCode,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================================
   /me  → token se current user
====================================================================== */
router.get("/me", async (req, res) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Dev admin
    if (decoded.id === "999" || decoded.id === 999) {
      return res.json({
        id: "999",
        username: "superadmin",
        role: "admin",
        balance: 999999,
        customerId: "GWDEV999999",
        createdAt: new Date(),
      });
    }

    let user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user = await ensureCustomerId(user);
    user = await ensureReferralCode(user);

    return res.json({
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      balance: user.balance,
      customerId: user.customerId,
      createdAt: user.createdAt,
      mobile: user.mobile,
      referralCode: user.referralCode,
    });
  } catch (err) {
    console.error("ME Error:", err);
    return res.status(401).json({ message: "Invalid token" });
  }
});

/* ======================================================================
   Middlewares
====================================================================== */
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

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
}

/* ======================================================================
   /balance – user balance update
====================================================================== */
router.post("/balance", authMiddleware, async (req, res) => {
  try {
    const { balance } = req.body;

    if (typeof balance !== "number") {
      return res.status(400).json({ message: "Balance must be a number" });
    }

    // Dev admin: sirf echo
    if (req.user.id === "999" || req.user.id === 999) {
      return res.json({
        message: "Balance updated for dev admin (local only)",
        user: {
          id: "999",
          username: "superadmin",
          role: "admin",
          balance,
          customerId: "GWDEV999999",
        },
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.balance = balance;
    await user.save();

    return res.json({
      message: "Balance updated",
      user: {
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        balance: user.balance,
        customerId: user.customerId,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("Balance Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================================
   /users – admin ke liye list (with customerId)
====================================================================== */
router.get("/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const dbUsers = await User.find(
      {},
      "username role balance isBlocked createdAt customerId mobile referralCode"
    );

    const safeList = [
      ...dbUsers.map((u) => ({
        id: u._id.toString(),
        username: u.username,
        role: u.role,
        balance: u.balance,
        isBlocked: u.isBlocked,
        createdAt: u.createdAt,
        customerId: u.customerId,
        mobile: u.mobile,
        referralCode: u.referralCode,
      })),
      {
        id: "999",
        username: "superadmin",
        role: "admin",
        balance: 999999,
        isBlocked: false,
        createdAt: new Date(),
        customerId: "GWDEV999999",
      },
    ];

    return res.json(safeList);
  } catch (err) {
    console.error("Users list error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================================
   /admin/adjust-balance
====================================================================== */
router.post(
  "/admin/adjust-balance",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { userId, amount, type } = req.body;
      const parsedAmount = Number(amount);

      if (!userId || !parsedAmount || parsedAmount <= 0) {
        return res
          .status(400)
          .json({ message: "userId and positive amount required" });
      }

      if (userId === "999" || userId === 999) {
        return res
          .status(400)
          .json({ message: "Cannot modify dev admin balance" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (type === "credit") {
        user.balance += parsedAmount;
      } else if (type === "debit") {
        user.balance = Math.max(0, user.balance - parsedAmount);
      } else {
        return res.status(400).json({ message: "Invalid type" });
      }

      await user.save();

      return res.json({
        message: "Balance adjusted",
        user: {
          id: user._id.toString(),
          username: user.username,
          role: user.role,
          balance: user.balance,
          customerId: user.customerId,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      console.error("Adjust balance error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ======================================================================
   /admin/toggle-block
====================================================================== */
router.post(
  "/admin/toggle-block",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { userId, block } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      if (userId === "999" || userId === 999) {
        return res
          .status(400)
          .json({ message: "Cannot block/unblock dev admin" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      user.isBlocked = !!block;
      await user.save();

      return res.json({
        message: block ? "User blocked" : "User unblocked",
        user: {
          id: user._id.toString(),
          username: user.username,
          role: user.role,
          balance: user.balance,
          isBlocked: user.isBlocked,
          customerId: user.customerId,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      console.error("Toggle block error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
