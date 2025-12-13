// backend/routes/game.js

const express = require("express");
const jwt = require("jsonwebtoken");
const Bet = require("../models/Bet");
const RoundResult = require("../models/RoundResult");
const User = require("../models/User");
const GameConfig = require("../models/GameConfig");
const { getBetLimits } = require("../config/betLimits");

const router = express.Router();

// SAME secret as auth.js
const JWT_SECRET = "superSecretKeyChangeThis";
// ✅ House edge: 2% platform fee on winnings
const HOUSE_FEE = 0.02; // 0.02 = 2%

/* ---------------------- MIDDLEWARES ---------------------- */

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");

  // ✅ INTERNAL CRON / SERVER TOKEN (AUTO SETTLE)
  if (token === process.env.INTERNAL_CRON_TOKEN) {
    req.user = { id: "CRON", role: "admin" };
    return next();
  }

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

/* ---------------------- PERIOD HELPERS ---------------------- */

function getSecondsForGameType(gameType) {
  switch (gameType) {
    case "30s":
      return 30;
    case "60s":
      return 60;
    case "180s":
      return 180;
    case "300s":
      return 300;
    default:
      return 30;
  }
}

// sab users same formula use karenge -> same period sab ke liye
function getCurrentPeriod(gameType = "30s") {
  const sec = getSecondsForGameType(gameType);
  const now = Date.now();
  const index = Math.floor(now / (sec * 1000));
  return `${gameType}-${index}`;
}

/* ---------------------- CONFIG + RISK ENGINE ---------------------- */

async function getGameConfig() {
  let cfg = await GameConfig.findOne({ key: "default" });
  if (!cfg) {
    cfg = await GameConfig.create({ key: "default" });
  }
  return cfg;
}

// number -> color
function colorFromNumber(num) {
  if (num === 0 || num === 5) return "V";
  if (num % 2 === 1) return "R";
  return "G";
}

// number -> size
function sizeFromNumber(num) {
  return num <= 4 ? "SMALL" : "BIG";
}

function pickRandom(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// user ko win karane wala number choose karo
function pickWinningNumber(bets) {
  if (!bets.length) return Math.floor(Math.random() * 10);

  const bet = pickRandom(bets); // randomly ek bet pakdo

  if (bet.betKind === "number") {
    return Number(bet.betValue);
  }

  if (bet.betKind === "color") {
    let pool = [];
    if (bet.betValue === "V") pool = [0, 5];
    else if (bet.betValue === "R") pool = [1, 3, 7, 9];
    else pool = [2, 4, 6, 8];
    return pickRandom(pool);
  }

  if (bet.betKind === "size") {
    let pool =
      bet.betValue === "SMALL" ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9];
    return pickRandom(pool);
  }

  return Math.floor(Math.random() * 10);
}

// user ke bets ko mostly haraane wala number choose karo
function pickLosingNumber(bets) {
  // saare numbers 0–9 check karenge
  const allNums = Array.from({ length: 10 }).map((_, i) => i);

  // aise numbers collect karo jinke against user ki koi bet win nahi karti
  const safeNums = allNums.filter((n) => {
    const col = colorFromNumber(n);
    const sz = sizeFromNumber(n);

    // agar koi bet is number pe win ho rahi ho to ye "safe" nahi
    const anyWin = bets.some((b) => {
      if (b.betKind === "number") {
        return Number(b.betValue) === n;
      }
      if (b.betKind === "color") {
        return b.betValue === col;
      }
      if (b.betKind === "size") {
        return b.betValue === sz;
      }
      return false;
    });

    return !anyWin;
  });

  if (safeNums.length) return pickRandom(safeNums);
  // sabhi numbers se koi na koi bet jeet rahi hai -> pure random
  return Math.floor(Math.random() * 10);
}

// main risk engine
async function decideResultNumber({ user, bets }) {
  const cfg = await getGameConfig();

  // agar profit mode band hai -> pure random
  if (!cfg.profitMode) {
    return Math.floor(Math.random() * 10);
  }

  let winBias = 0.5;

  const now = Date.now();
  const isNewUser =
    user.createdAt && now - user.createdAt.getTime() < 3 * 24 * 60 * 60 * 1000;

  const biggestBet = bets.reduce(
    (m, b) => Math.max(m, b.amount || 0),
    0
  );
  const hasBigBet = biggestBet >= 300;

  const underTurnover =
    user.hasActiveDeposit &&
    user.pendingTurnover > 0 &&
    (user.tradeVolumeSinceLastDeposit || 0) < user.pendingTurnover;

  if (cfg.newUserBoost && isNewUser) {
    winBias += 0.2; // new users ko thoda boost
  }

  if (cfg.bigBetRisk && hasBigBet) {
    winBias -= 0.25; // bade bet pe risk
  }

  if (cfg.withdrawalRisk && underTurnover) {
    winBias -= 0.2; // turnover poora karwane ka pressure
  }

  // clamp 5%–95%
  winBias = Math.max(0.05, Math.min(winBias, 0.95));

  const userShouldWin = Math.random() < winBias;

  if (!bets.length) {
    return Math.floor(Math.random() * 10);
  }

  if (userShouldWin) return pickWinningNumber(bets);
  return pickLosingNumber(bets);
}

/* ============================================================
   GET current period
   GET /api/game/current?gameType=30s
============================================================ */
router.get("/current", authMiddleware, async (req, res) => {
  try {
    const { gameType = "30s" } = req.query;
    const period = getCurrentPeriod(gameType);

    return res.json({
      gameType,
      period,
    });
  } catch (err) {
    console.error("Current period error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   RESULTS HISTORY
   GET /api/game/results?gameType=30s&limit=50
   -> last N results for history section
============================================================ */
router.get("/results", authMiddleware, async (req, res) => {
  try {
    const { gameType = "30s", limit = 50 } = req.query;
    const lim = Math.min(Number(limit) || 50, 200);

    const list = await RoundResult.find({ gameType })
      .sort({ createdAt: -1 })
      .limit(lim);

    return res.json(
      list.map((r) => ({
        period: r.period,
        number: r.resultNumber,
        color: r.resultColor,
        size: r.resultSize || (r.resultNumber <= 4 ? "SMALL" : "BIG"),
        createdAt: r.createdAt,
      }))
    );
  } catch (err) {
    console.error("Results history error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});




// USER TRADE HISTORY
// GET /api/game/my-trades?gameType=30s&limit=50
router.get("/my-trades", authMiddleware, async (req, res) => {
  try {
    const { gameType = "30s", limit = 50 } = req.query;

    const trades = await Bet.find({
      user: req.user.id,
      gameType,
    })
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 100));

    return res.json(
      trades.map((b) => ({
        period: b.period,
        betKind: b.betKind,
        betValue: b.betValue,
        amount: b.amount,
        win: b.win,
        profit: b.profit,
        resultNumber: b.resultNumber,
        resultColor: b.resultColor,
        resultSize: b.resultSize,
        createdAt: b.createdAt,
      }))
    );
  } catch (err) {
    console.error("Trade history error:", err);
    res.status(500).json({ message: "Server error" });
  }
});







/* ============================================================
   PLACE BET
   POST /api/game/bet
   body: { gameType, betKind, betValue, amount }
   betKind: "color" | "number" | "size"
   betValue: "G"/"R"/"V" | "0"-"9" | "SMALL"/"BIG"
============================================================ */
router.post("/bet", authMiddleware, async (req, res) => {
  try {
    const {
      gameType = "30s",
      betKind, // "color" | "number" | "size"
      betValue, // "G","R","V","0"-"9","SMALL","BIG"
      amount,
    } = req.body;

    const parsedAmount = Number(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ message: "Invalid bet amount" });
    }

    const { min, max } = getBetLimits(gameType);

    if (parsedAmount < min) {
      return res.status(400).json({
        message: `Minimum bet is ₹${min}`,
        min,
        max,
      });
    }

    if (parsedAmount > max) {
      return res.status(400).json({
        message: `Maximum bet is ₹${max}`,
        min,
        max,
      });
    }

    if (!["color", "number", "size"].includes(betKind)) {
      return res.status(400).json({ message: "Invalid bet kind" });
    }

    if (!["color", "number", "size"].includes(betKind)) {
      return res.status(400).json({ message: "Invalid bet kind" });
    }

    if (!betValue) {
      return res.status(400).json({ message: "betValue is required" });
    }

    const period = getCurrentPeriod(gameType);

    // dev / superadmin ko game play se rok do
    if (req.user.id === "999" || req.user.id === 999) {
      return res.status(400).json({
        message: "Superadmin se game play mat karo. Normal user banao.",
      });
    }

    // user & balance check
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isBlocked) {
      return res.status(403).json({ message: "User is blocked" });
    }

    if (user.balance < parsedAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // balance lock (bet ke time par hi deduct)
    user.balance -= parsedAmount;
    await user.save();

    user.tradeVolumeSinceLastDeposit =
      (user.tradeVolumeSinceLastDeposit || 0) + parsedAmount;
    await user.save();

    const bet = await Bet.create({
      user: user._id,
      gameType,
      period,
      betKind,
      betValue,
      amount: parsedAmount,
      settled: false,
    });

    return res.json({
      message: "Bet placed",
      bet: {
        id: bet._id.toString(),
        gameType,
        period,
        betKind,
        betValue,
        amount: parsedAmount,
        currentBalance: user.balance,
      },
    });
  } catch (err) {
    console.error("Bet place error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   ADMIN: Risk engine config get
   GET /api/game/admin/config
============================================================ */
router.get(
  "/admin/config",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const cfg = await getGameConfig();
      return res.json({
        profitMode: cfg.profitMode,
        newUserBoost: cfg.newUserBoost,
        withdrawalRisk: cfg.withdrawalRisk,
        bigBetRisk: cfg.bigBetRisk,
      });
    } catch (err) {
      console.error("Game config get error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ============================================================
   ADMIN: Risk engine config update
   POST /api/game/admin/config
   body: { profitMode?, newUserBoost?, withdrawalRisk?, bigBetRisk? }
============================================================ */
router.post(
  "/admin/config",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { profitMode, newUserBoost, withdrawalRisk, bigBetRisk } =
        req.body || {};

      const cfg = await GameConfig.findOneAndUpdate(
        { key: "default" },
        {
          key: "default",
          ...(typeof profitMode === "boolean" && { profitMode }),
          ...(typeof newUserBoost === "boolean" && { newUserBoost }),
          ...(typeof withdrawalRisk === "boolean" && { withdrawalRisk }),
          ...(typeof bigBetRisk === "boolean" && { bigBetRisk }),
        },
        { upsert: true, new: true }
      );

      return res.json({
        message: "Game config updated",
        profitMode: cfg.profitMode,
        newUserBoost: cfg.newUserBoost,
        withdrawalRisk: cfg.withdrawalRisk,
        bigBetRisk: cfg.bigBetRisk,
      });
    } catch (err) {
      console.error("Game config update error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ============================================================
   ADMIN: Period stats
   GET /api/game/admin/period-stats?gameType=30s&period=30s-12345
   -> kis option pe kitna total amount laga
============================================================ */
router.get(
  "/admin/period-stats",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { gameType = "30s", period } = req.query;

      if (!period) {
        return res.status(400).json({ message: "period is required" });
      }

      const stats = await Bet.aggregate([
        {
          $match: {
            gameType,
            period,
          },
        },
        {
          $group: {
            _id: { betKind: "$betKind", betValue: "$betValue" },
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { totalAmount: -1 },
        },
      ]);

      return res.json(
        stats.map((s) => ({
          betKind: s._id.betKind,
          betValue: s._id.betValue,
          totalAmount: s.totalAmount,
          count: s.count,
        }))
      );
    } catch (err) {
      console.error("Period stats error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ============================================================
   ADMIN: Set result for a period (manual control)
   POST /api/game/admin/set-result
   body: { gameType, period, resultNumber, resultColor?, resultSize? }
============================================================ */
router.post(
  "/admin/set-result",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      let {
        gameType = "30s",
        period,
        resultNumber,
        resultColor, // optional – admin se aayega
        resultSize, // optional – admin se aayega (SMALL / BIG)
      } = req.body;

      if (!period) {
        return res.status(400).json({ message: "period is required" });
      }

      const num = Number(resultNumber);
      if (Number.isNaN(num) || num < 0 || num > 9) {
        return res.status(400).json({ message: "Invalid resultNumber" });
      }

      // ✅ 1) DEFAULT rules (agar admin ne kuch nahi diya)
      let finalColor = "G";
      if (num === 0 || num === 5) finalColor = "V";
      else if (num % 2 === 1) finalColor = "R";

      let finalSize = num <= 4 ? "SMALL" : "BIG";

      // ✅ 2) Agar admin ne color manually diya ho, use override kar do
      if (resultColor) {
        const c = String(resultColor).trim().toUpperCase();

        // Support: "G", "R", "V", "GREEN", "RED", "VIOLET"
        if (["G", "GREEN"].includes(c)) finalColor = "G";
        else if (["R", "RED"].includes(c)) finalColor = "R";
        else if (["V", "VIOLET"].includes(c)) finalColor = "V";
        else {
          return res.status(400).json({ message: "Invalid resultColor" });
        }
      }

      // ✅ 3) Agar admin ne size manually diya ho, use override kar do
      if (resultSize) {
        const s = String(resultSize).trim().toUpperCase();
        if (["SMALL", "S"].includes(s)) finalSize = "SMALL";
        else if (["BIG", "B"].includes(s)) finalSize = "BIG";
        else {
          return res.status(400).json({ message: "Invalid resultSize" });
        }
      }

      const roundResult = await RoundResult.findOneAndUpdate(
        { gameType, period },
        {
          gameType,
          period,
          resultNumber: num,
          resultColor: finalColor,
          resultSize: finalSize,
          forcedByAdmin: true,
        },
        { upsert: true, new: true }
      );

      return res.json({
        message: "Result set for period",
        gameType,
        period,
        resultNumber: roundResult.resultNumber,
        resultColor: roundResult.resultColor,
        resultSize: roundResult.resultSize,
        forcedByAdmin: roundResult.forcedByAdmin,
      });
    } catch (err) {
      console.error("Admin set-result error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ============================================================
   SETTLE (user-wise)
   POST /api/game/settle
   body: { gameType, period }
   -> current user ke open bets ko WIN/LOSS karega + balance update
============================================================ */
router.post("/settle", authMiddleware, async (req, res) => {
  try {
    const { gameType = "30s", period } = req.body;

    if (!period) {
      return res.status(400).json({ message: "period is required" });
    }

    // 🛑 Dev admin / superadmin ka fake id "999" hai → Mongo me user doc nahi hai
    // isliye is account se settle karne hi mat do (warna CastError ayega)
    if (req.user.id === "999" || req.user.id === 999) {
      return res.status(400).json({
        message:
          "Dev admin/superadmin account se bets settle nahi ho sakte. Normal user account se khelo.",
      });
    }

    // ✅ yahan se real Mongo ObjectId wale user pe kaam chalega
    const _settleUser = await User.findById(req.user.id);
    if (!_settleUser)
      return res.status(404).json({ message: "User not found" });

    // current user ke iss period ke unsettled bets
    const bets = await Bet.find({
      user: req.user.id,
      gameType,
      period,
      settled: false,
    });

    // agar bets hi nahi hain, phir bhi result fix kar sakte ho, but user ke liye koi settlement nahi
    if (!bets.length) {
  // Always generate & store round result for history
  let roundResult = await RoundResult.findOne({
  gameType,
  period,
  forcedByAdmin: true
});


  if (!roundResult) {
  let n;

  // ✅ real randomness
  n = Math.floor(Math.random() * 10);

  const c = colorFromNumber(n);
  const sz = sizeFromNumber(n);

  roundResult = await RoundResult.findOneAndUpdate(
    { gameType, period },
    {
      gameType,
      period,
      resultNumber: n,
      resultColor: c,
      resultSize: sz,
      forcedByAdmin: false,
    },
    { upsert: true, new: true }
  );
}


  return res.json({
    message: "No unsettled bets for this period.",
    resultNumber: roundResult.resultNumber,
    resultColor: roundResult.resultColor,
    size: roundResult.resultSize,
    hadBets: false,
  });
}

    // Result: admin set → use that, otherwise risk engine se
    let roundResult = await RoundResult.findOne({ gameType, period });

    if (!roundResult) {
      let n;

      // 🔥 70% pure random, 30% risk engine
      if (Math.random() < 0.7) {
        n = Math.floor(Math.random() * 10);
      } else {
         n = await decideResultNumber({ user: _settleUser, bets });
      }

      const c = colorFromNumber(n);
      const sz = sizeFromNumber(n);


      try {
        roundResult = await RoundResult.findOneAndUpdate(
          { gameType, period },
          {
            gameType,
            period,
            resultNumber: n,
            resultColor: c,
            resultSize: sz,
            forcedByAdmin: false,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        if (err.code === 11000) {
          // koi aur process ne pehle hi likh diya
          roundResult = await RoundResult.findOne({ gameType, period });
        } else {
          throw err;
        }
      }
    }

    const resultNumber = roundResult.resultNumber;
    const resultColor = roundResult.resultColor;
    const size =
      roundResult.resultSize || (resultNumber <= 4 ? "SMALL" : "BIG");

    let totalProfit = 0;
    let totalFeeCollected = 0;

    for (const bet of bets) {
      // turnover tracking
      _settleUser.tradeVolumeSinceLastDeposit =
        (_settleUser.tradeVolumeSinceLastDeposit || 0) + bet.amount;

      let mult = 0;
      let isWin = false;

      if (bet.betKind === "color") {
        if (bet.betValue === resultColor) {
          mult = 2;
          isWin = true;
        }
      } else if (bet.betKind === "number") {
        if (Number(bet.betValue) === resultNumber) {
          mult = 10;
          isWin = true;
        }
      } else if (bet.betKind === "size") {
        if (bet.betValue === size) {
          mult = 2;
          isWin = true;
        }
      }

      let profit = 0;
      if (isWin) {
        const grossWin = bet.amount * mult;
        const fee = Math.round(grossWin * HOUSE_FEE);
        profit = grossWin - fee;

        _settleUser.balance += profit;
        totalProfit += profit;
        totalFeeCollected += fee;
      }

      bet.resultNumber = resultNumber;
      bet.resultColor = resultColor;
      bet.resultSize = size;
      bet.win = isWin;
      bet.profit = profit;
      bet.settled = true;
      bet.balanceAfter = _settleUser.balance;
      await bet.save();
    }

    // turnover complete ho gaya to flags reset
    if (
      _settleUser.hasActiveDeposit &&
      _settleUser.pendingTurnover > 0 &&
      (_settleUser.tradeVolumeSinceLastDeposit || 0) >=
        _settleUser.pendingTurnover
    ) {
      _settleUser.hasActiveDeposit = false;
      _settleUser.pendingTurnover = 0;
      _settleUser.tradeVolumeSinceLastDeposit = 0;
    }

    await _settleUser.save();

    return res.json({
      message: "Bets settled",
      hadBets: true,
      resultNumber,
      resultColor,
      size,
      totalProfit,
      balance: _settleUser.balance,
      houseFeePercent: HOUSE_FEE * 100,
      totalFeeCollected,
    });
  } catch (err) {
    console.error("Settle error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
