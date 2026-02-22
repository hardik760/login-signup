// ═══════════════════════════════════════════════════════
// controllers/authController.js
// ═══════════════════════════════════════════════════════
'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { User, RefreshToken } = require('../models');
const asyncHandler = require('../middleware/asyncHandler');

// Token generation helpers
function generateAccessToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '15m' }); // Short-lived
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex'); // Opaque, stored in DB
}

// ── SIGNUP ────────────────────────────────────────────
exports.signup = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, mobile, password } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { mobile }] });
  if (existing) {
    const field = existing.email === email ? 'Email' : 'Mobile number';
    return res.status(409).json({ error: `${field} is already registered` });
  }

  // Never use bcrypt.hashSync — it blocks the Node.js event loop!
  const hash = await bcrypt.hash(password, 12); // 12 rounds = secure + fast enough

  const user = await User.create({ firstName, lastName, email, mobile, password: hash });

  const accessToken  = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken();

  // Store refresh token in DB
  await RefreshToken.create({
    userId:    user._id,
    token:     refreshToken,
    userAgent: req.headers['user-agent'],
    ip:        req.ip,
    expiresAt: new Date(Date.now() + 30 * 86400 * 1000), // 30 days
  });

  res.status(201).json({
    message: 'Account created successfully',
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      firstName, lastName, email, mobile,
      sosCredit: user.sosCredit,
    }
  });
});

// ── SIGNIN ────────────────────────────────────────────
exports.signin = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  const user = await User.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { mobile: identifier }
    ]
  }).select('+password'); // password is select:false by default, must opt in

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

  // Update last active
  user.lastActive = new Date();
  await user.save({ validateBeforeSave: false });

  const accessToken  = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken();

  await RefreshToken.create({
    userId:    user._id,
    token:     refreshToken,
    userAgent: req.headers['user-agent'],
    ip:        req.ip,
    expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
  });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName:  user.lastName,
      email:     user.email,
      mobile:    user.mobile,
      role:      user.role,
      sosCredit: user.sosCredit,
    }
  });
});

// ── REFRESH TOKEN ─────────────────────────────────────
// Client sends refresh token when access token expires
// We issue a new access token WITHOUT requiring re-login
exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  const stored = await RefreshToken.findOne({ token: refreshToken, isValid: true });
  if (!stored) return res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' });

  if (stored.expiresAt < new Date()) {
    await RefreshToken.deleteOne({ _id: stored._id });
    return res.status(401).json({ error: 'Refresh token expired. Please log in again.' });
  }

  // Rotate: invalidate old token, issue new pair (security best practice)
  await RefreshToken.updateOne({ _id: stored._id }, { isValid: false });

  const newAccessToken  = generateAccessToken(stored.userId);
  const newRefreshToken = generateRefreshToken();

  await RefreshToken.create({
    userId:    stored.userId,
    token:     newRefreshToken,
    userAgent: req.headers['user-agent'],
    ip:        req.ip,
    expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
  });

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

// ── LOGOUT ────────────────────────────────────────────
exports.logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await RefreshToken.deleteOne({ token: refreshToken, userId: req.user._id });
  }
  res.json({ message: 'Logged out successfully' });
});

// ── GET ME ────────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  const { Vehicle } = require('../models');
  const vehicleCount = await Vehicle.countDocuments({ ownerId: req.user._id });
  res.json({ ...req.user.toObject(), vehicleCount });
});
