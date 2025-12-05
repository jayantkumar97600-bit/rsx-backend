// backend/middleware/auth.js
const jwt = require("jsonwebtoken");

// NOTE: yahi secret sab jagah use hoga (auth + middleware)
const JWT_SECRET = "superSecretKeyChangeThis";

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

module.exports = {
  authMiddleware,
  adminMiddleware,
  JWT_SECRET,
};
