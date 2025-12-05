// server.js - production-ready, graceful shutdown, uses env vars
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// --- Basic logger to replace morgan so builds won't fail if morgan not installed
function log(...args) { console.log(new Date().toISOString(), ...args); }

// --- Routes (example)
app.get('/', (req, res) => res.json({ message: 'API is running' }));

// import your routes if present (make sure files exist)
// const authRoutes = require('./routes/auth');
// app.use('/api/auth', authRoutes);

// --- Mongo connection
const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/godwin';
async function connectMongo() {
  try {
    log('Connecting to MongoDB:', MONGO_URI.startsWith('mongodb+srv') ? 'atlas uri (masked)' : MONGO_URI);
    await mongoose.connect(MONGO_URI, {
      // modern driver options - mongoose v? handles these internally; keep simple
      // useUnifiedTopology/useNewUrlParser no longer required for modern drivers
    });
    log('✅ MongoDB Connected');
  } catch (err) {
    log('❌ MongoDB connection error:', err.message || err);
    // DON'T call process.exit here; let service retry and platform decide restart
  }
}
connectMongo();

// --- Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  log(`🚀 Server running on port ${PORT}`);
});

// --- Graceful shutdown
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`⚠️  Received ${signal}. Shutting down gracefully...`);
  try {
    // stop accepting new connections
    server.close(() => {
      log('HTTP server closed.');
    });

    // close mongoose
    try {
      await mongoose.disconnect();
      log('Mongo connection closed.');
    } catch (e) {
      log('Error while closing mongo:', e && e.message ? e.message : e);
    }

    // allow a short time to finish
    setTimeout(() => {
      log('Exiting process after graceful shutdown.');
      // use process.exit with 0 only after cleanup — platform will restart if needed
      process.exit(0);
    }, 1000);
  } catch (err) {
    log('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// --- Optional unhandled handlers (log only)
process.on('unhandledRejection', (reason) => {
  log('Unhandled Rejection:', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  log('Uncaught Exception:', err && err.stack ? err.stack : err);
});
