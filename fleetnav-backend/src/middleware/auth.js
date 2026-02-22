// ═══════════════════════════════════════════════════════
// middleware/auth.js — JWT Authentication
// ═══════════════════════════════════════════════════════
'use strict';

const jwt = require('jsonwebtoken');
const { User } = require('../models');
const asyncHandler = require('./asyncHandler');

const auth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please log in.' });
  }

  const token = header.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please refresh your session.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token. Please log in again.' });
  }

  const user = await User.findById(decoded.id).select('-password -refreshToken');
  if (!user) return res.status(401).json({ error: 'User no longer exists.' });

  req.user = user;
  next();
});

module.exports = auth;
