// ═══════════════════════════════════════════════════════
// middleware/asyncHandler.js
// Wraps async route functions to catch errors automatically
// Without this, an unhandled promise rejection CRASHES the server
// ═══════════════════════════════════════════════════════
'use strict';

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
