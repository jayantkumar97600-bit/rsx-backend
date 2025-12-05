// backend/routes/aviator.js
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AviatorBet = require("../models/AviatorBet");
const AviatorRound = require("../models/AviatorRound");

const router = express.Router();
const JWT_SECRET = "superSecretKeyChangeThis";

// 1 round = 30s, last 5s betting closed
const ROUND_SECONDS = 30;
const LOCK_LAST_SECONDS = 5;
// optional: 2% fee on winnings
const HOUSE_FEE = 0.02;

/* ------------ auth middlewares (same as game.js) ------------ */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

/* ------------ helpers ------------ */

// period id: AVI-<index>
function getCurrentAviatorPeriod() {
  const now = Date.now();
  const index = Math.floor(now / (ROUND_SECONDS * 1000));
  return `AVI-${index}`;
}

function getRoundTimes(period) {
  // period format: AVI-12345678
  const index = Number(String(period).split("-")[1] || "0");
  const startMs = index * ROUND_SECONDS * 1000;
  const endMs = startMs + ROUND_SECONDS * 1000;
  return { startMs, endMs };
}

/* ============================================================
   GET STATE
   GET /api/aviator/state
   -> front-end timer & betting allowed ya nahi
============================================================ */
router.get("/state", authMiddleware, async (req, res) => {
  const nowMs = Date.now();
  const period = getCurrentAviatorPeriod();
  const { startMs, endMs } = getRoundTimes(period);

  const remainingSec = Math.max(0, Math.floor((endMs - nowMs) / 1000));
  const bettingOpen = remainingSec > LOCK_LAST_SECONDS;

  return res.json({
    period,
    serverTime: nowMs,
    roundEndsAt: endMs,
    remainingSec,
    bettingOpen,
    roundSeconds: ROUND_SECONDS,
    lockLastSeconds: LOCK_LAST_SECONDS,
  });
});
