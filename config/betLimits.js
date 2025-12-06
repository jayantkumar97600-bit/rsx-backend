// config/betLimits.js

// Environment se MIN / MAX lene ka option
// Agar env me nahi diya to default use hoga
const DEFAULT_MIN_BET = Number(process.env.MIN_BET || 10);       // ₹10 min
const DEFAULT_MAX_BET = Number(process.env.MAX_BET || 100000);   // ₹1 lakh max

// Agar tum alag-alag game type k liye alag limits rakhna chaho to yahan change kar sakte ho
const LIMITS_BY_GAME = {
  "30s": { min: DEFAULT_MIN_BET, max: DEFAULT_MAX_BET },
  "1m": { min: DEFAULT_MIN_BET, max: DEFAULT_MAX_BET },
  "3m": { min: DEFAULT_MIN_BET, max: DEFAULT_MAX_BET },
  "5m": { min: DEFAULT_MIN_BET, max: DEFAULT_MAX_BET },
};

function getBetLimits(gameType) {
  return LIMITS_BY_GAME[gameType] || LIMITS_BY_GAME["30s"];
}

module.exports = { getBetLimits };
