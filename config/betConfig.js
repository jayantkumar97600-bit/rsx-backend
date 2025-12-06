// backend/config/betConfig.js

// Minimum aur maximum bet amount (₹ me)
const MIN_BET = 1;        // jitna chhota chahiye utna rakh sakta hai
const MAX_BET = 100000;   // yahan jitna limit rakhni ho rakho (₹1 lakh example)

// Agar kabhi unlimited chahiye ho to MAX_BET ko null bhi kar sakte ho
// const MAX_BET = null;

module.exports = { MIN_BET, MAX_BET };
