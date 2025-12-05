// backend/routes/referral.js
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Deposit = require("../models/Deposit");

const router = express.Router();

// SAME secret as auth.js
const JWT_SECRET = "superSecretKeyChangeThis";

// Referral commission rates (percent)
const LVL1_RATE = 1.5; // 1.5%
const LVL2_RATE = 0.5; // 0.5%
const LVL3_RATE = 0.25; // 0.25%

/* ----------------- Middlewares ----------------- */
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

async function sumApprovedDeposits(userIds) {
  if (!userIds || userIds.length === 0) return 0;

  const result = await Deposit.aggregate([
    {
      $match: {
        user: { $in: userIds },
        status: "APPROVED",
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ]);

  return result[0]?.total || 0;
}

/* ============================================================
   GET /api/referral/team-stats
   -> Level 1, 2, 3 team size + deposit volume + estimated commission
============================================================ */
router.get("/team-stats", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: "User not found" });

    // Level 1: direct referees
    const lvl1Users = await User.find({ referredBy: me._id }).select(
      "_id username createdAt"
    );
    const lvl1Ids = lvl1Users.map((u) => u._id);

    // Level 2: those referred by level 1
    const lvl2Users = await User.find({
      referredBy: { $in: lvl1Ids },
    }).select("_id username createdAt");
    const lvl2Ids = lvl2Users.map((u) => u._id);

    // Level 3: those referred by level 2
    const lvl3Users = await User.find({
      referredBy: { $in: lvl2Ids },
    }).select("_id username createdAt");
    const lvl3Ids = lvl3Users.map((u) => u._id);

    // Deposit volume per level (only APPROVED)
    const lvl1Volume = await sumApprovedDeposits(lvl1Ids);
    const lvl2Volume = await sumApprovedDeposits(lvl2Ids);
    const lvl3Volume = await sumApprovedDeposits(lvl3Ids);

    // Commission per level (simple estimate)
    const lvl1Commission = Math.round(lvl1Volume * (LVL1_RATE / 100));
    const lvl2Commission = Math.round(lvl2Volume * (LVL2_RATE / 100));
    const lvl3Commission = Math.round(lvl3Volume * (LVL3_RATE / 100));

    const totalTeamSize =
      lvl1Users.length + lvl2Users.length + lvl3Users.length;
    const totalCommission =
      lvl1Commission + lvl2Commission + lvl3Commission;

    return res.json({
      totalTeamSize,
      levels: [
        {
          level: 1,
          members: lvl1Users.length,
          volume: lvl1Volume,
          ratePercent: LVL1_RATE,
          commission: lvl1Commission,
        },
        {
          level: 2,
          members: lvl2Users.length,
          volume: lvl2Volume,
          ratePercent: LVL2_RATE,
          commission: lvl2Commission,
        },
        {
          level: 3,
          members: lvl3Users.length,
          volume: lvl3Volume,
          ratePercent: LVL3_RATE,
          commission: lvl3Commission,
        },
      ],
      totalCommission,
    });
  } catch (err) {
    console.error("Team stats error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
