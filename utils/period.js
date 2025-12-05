// backend/utils/period.js
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

// same formula -> sab users ko same period
function getCurrentPeriod(gameType = "30s") {
  const sec = getSecondsForGameType(gameType);
  const now = Date.now();
  const index = Math.floor(now / (sec * 1000));
  return `${gameType}-${index}`;
}

module.exports = {
  getSecondsForGameType,
  getCurrentPeriod,
};
