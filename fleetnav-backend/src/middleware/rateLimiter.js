// ═══════════════════════════════════════════════════════
// middleware/rateLimiter.js
// Different limits for different endpoint types
// ═══════════════════════════════════════════════════════
'use strict';

const rateLimit = require('express-rate-limit');

// Global API limit — 300 req/min per IP
const global = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.', retryAfter: '60 seconds' },
  // Use vehicleId header as key if present (more accurate for IoT devices)
  keyGenerator: (req) => req.headers['x-device-id'] || req.ip,
});

// Auth endpoints — strict: 20 attempts/min (prevent brute force)
const auth = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again in 1 minute.' },
  skipSuccessfulRequests: true, // Only count failed attempts
});

// GPS location pings — max 10/sec per device
// At scale: vehicle sends 1 ping/5sec normally, this allows bursts
const location = rateLimit({
  windowMs: 1000,    // 1 second window
  max: 10,
  message: { error: 'Location update rate limit exceeded.' },
  keyGenerator: (req) => req.params.vehicleId || req.headers['x-device-id'] || req.ip,
});

// SOS — extremely strict: 1 per 24h per IP
// Backed up by the database one-time credit check too
const sos = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 1,
  message: { error: 'SOS is a one-time signal. This IP has already triggered SOS today.' },
});

module.exports = { global, auth, location, sos };
