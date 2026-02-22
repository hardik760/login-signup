// ═══════════════════════════════════════════════════════
// models/index.js
// All database schemas in one place
// ═══════════════════════════════════════════════════════
'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ════════════════════════════════════════
// USER MODEL
// ════════════════════════════════════════
const userSchema = new Schema({
  firstName:    { type: String, required: true, trim: true, maxlength: 50 },
  lastName:     { type: String, required: true, trim: true, maxlength: 50 },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  mobile:       { type: String, required: true, unique: true, trim: true },
  password:     { type: String, required: true, minlength: 8, select: false }, // Never returned by default
  profilePic:   { type: String, default: null },
  isVerified:   { type: Boolean, default: false },
  role:         { type: String, enum: ['user', 'driver', 'admin'], default: 'user' },
  sosCredit:    { type: Number, default: 1, min: 0 },  // One-time SOS per user
  refreshToken: { type: String, default: null, select: false },
  lastActive:   { type: Date, default: Date.now },
}, { timestamps: true });

userSchema.index({ email: 1 });
userSchema.index({ mobile: 1 });

const User = mongoose.model('User', userSchema);


// ════════════════════════════════════════
// VEHICLE MODEL
// ════════════════════════════════════════
const vehicleSchema = new Schema({
  // Auto-generated short ID — no manual creation needed per vehicle
  vehicleId: {
    type: String,
    unique: true,
    default: () => 'veh_' + Math.random().toString(36).substr(2, 9)
  },
  ownerId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name:        { type: String, default: 'My Vehicle', trim: true, maxlength: 60 },
  type:        { type: String, enum: ['car','bike','bus','truck','auto','other'], required: true },
  plate:       { type: String, required: true, unique: true, uppercase: true, trim: true },
  make:        { type: String, trim: true },   // Honda, Tata, etc.
  model:       { type: String, trim: true },   // City, Nexon, etc.
  color:       { type: String, trim: true },
  year:        { type: Number, min: 1990, max: new Date().getFullYear() + 1 },

  // Public vehicle config (buses, shared autos)
  isPublic:    { type: Boolean, default: false },
  destination: { type: String, trim: true, default: null },  // Bus destination
  fleetId:     { type: String, default: null },

  // Status
  status:      { type: String, enum: ['active','idle','offline','inactive'], default: 'inactive' },
  lastSeen:    { type: Date, default: null },
}, { timestamps: true });

// All the indexes that matter for performance
vehicleSchema.index({ ownerId: 1 });
vehicleSchema.index({ plate: 1 });
vehicleSchema.index({ ownerId: 1, status: 1 });
vehicleSchema.index({ isPublic: 1, type: 1, status: 1 });
vehicleSchema.index({ fleetId: 1 });

const Vehicle = mongoose.model('Vehicle', vehicleSchema);


// ════════════════════════════════════════
// LOCATION LOG (Time-series)
// ════════════════════════════════════════
const locationSchema = new Schema({
  vehicleId: { type: String, required: true },
  lat:       { type: Number, required: true, min: -90,  max: 90  },
  lng:       { type: Number, required: true, min: -180, max: 180 },
  speed:     { type: Number, default: 0, min: 0 },
  heading:   { type: Number, default: 0, min: 0, max: 360 },
  accuracy:  { type: Number, default: 0 },
  altitude:  { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now },
});

// Primary query: give me all history for vehicle X sorted newest first
locationSchema.index({ vehicleId: 1, timestamp: -1 });

// Auto-delete location data after 30 days (keeps DB lean)
locationSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 86400 });

const LocationLog = mongoose.model('LocationLog', locationSchema);


// ════════════════════════════════════════
// ROUTE REPORT (Hazards, Accidents, etc.)
// ════════════════════════════════════════
const routeReportSchema = new Schema({
  reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['accident','traffic','construction','pothole','harassment','flooding','other'],
    required: true
  },
  reason:   { type: String, required: true, trim: true, minlength: 5, maxlength: 500 },
  lat:      { type: Number, required: true },
  lng:      { type: Number, required: true },
  severity: { type: String, enum: ['low','medium','high'], default: 'medium' },
  verified: { type: Boolean, default: false },
  upvotes:  { type: Number, default: 0 },
  downvotes:{ type: Number, default: 0 },
  // Auto-expire reports after 6 hours (road conditions change)
  expiresAt:{ type: Date, default: () => new Date(Date.now() + 6 * 3600 * 1000) },
}, { timestamps: true });

routeReportSchema.index({ lat: 1, lng: 1 });
routeReportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-delete

const RouteReport = mongoose.model('RouteReport', routeReportSchema);


// ════════════════════════════════════════
// SOS EVENT
// ════════════════════════════════════════
const sosSchema = new Schema({
  userId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  vehicleId:  { type: String, default: null },
  lat:        { type: Number },
  lng:        { type: Number },
  resolved:   { type: Boolean, default: false },
  resolvedAt: { type: Date, default: null },
  respondedBy:{ type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

sosSchema.index({ userId: 1 });
sosSchema.index({ resolved: 1, createdAt: -1 });

const SOS = mongoose.model('SOS', sosSchema);


// ════════════════════════════════════════
// REFRESH TOKEN (for secure JWT rotation)
// ════════════════════════════════════════
const refreshTokenSchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  token:     { type: String, required: true },
  userAgent: { type: String },
  ip:        { type: String },
  isValid:   { type: Boolean, default: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

// Auto-delete expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ token: 1 });

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);


module.exports = { User, Vehicle, LocationLog, RouteReport, SOS, RefreshToken };
