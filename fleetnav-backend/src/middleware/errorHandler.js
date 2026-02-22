// ═══════════════════════════════════════════════════════
// middleware/errorHandler.js
// Global error handler — catches ALL unhandled errors
// Prevents server crashes from unhandled exceptions
// ═══════════════════════════════════════════════════════
'use strict';

function errorHandler(err, req, res, next) {
  // Log the error (in production, send to Sentry/Datadog)
  console.error(`[ERROR] ${req.method} ${req.url} —`, err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ error: 'Validation failed', details: messages });
  }

  // Mongoose duplicate key (unique index violation)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({ error: `${field} already exists` });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
  }

  // Custom app errors (thrown with err.statusCode)
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'An unexpected error occurred';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
