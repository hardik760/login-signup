// ═══════════════════════════════════════════════════════
// controllers/vehicleController.js
// KEY POINT: All routes use :vehicleId — zero manual
// endpoint creation needed per vehicle or user
// ═══════════════════════════════════════════════════════
'use strict';

const { Vehicle } = require('../models');
const asyncHandler = require('../middleware/asyncHandler');

// ── REGISTER ──────────────────────────────────────────
// Works for car, bike, bus, truck — any type
// The vehicleId is auto-generated, no manual creation
exports.register = asyncHandler(async (req, res) => {
  const { name, type, plate, make, model, color, year, isPublic, destination, fleetId } = req.body;

  const existing = await Vehicle.findOne({ plate: plate.toUpperCase() });
  if (existing) {
    return res.status(409).json({ error: `Plate ${plate} is already registered in the system` });
  }

  const vehicle = await Vehicle.create({
    ownerId: req.user._id,
    name, type,
    plate: plate.toUpperCase(),
    make, model, color, year,
    isPublic: Boolean(isPublic),
    destination: isPublic ? destination : null,
    fleetId: fleetId || null,
  });

  res.status(201).json({ message: 'Vehicle registered successfully', vehicle });
});

// ── LIST ALL (paginated, filterable) ─────────────────
exports.list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, status, type, fleetId } = req.query;

  const filter = { ownerId: req.user._id };
  if (status)  filter.status  = status;
  if (type)    filter.type    = type;
  if (fleetId) filter.fleetId = fleetId;

  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const [vehicles, total] = await Promise.all([
    Vehicle.find(filter)
      .sort({ lastSeen: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Vehicle.countDocuments(filter),
  ]);

  res.json({
    data: vehicles,
    pagination: {
      total,
      page:       pageNum,
      limit:      limitNum,
      totalPages: Math.ceil(total / limitNum),
      hasNext:    pageNum < Math.ceil(total / limitNum),
    }
  });
});

// ── GET ONE ───────────────────────────────────────────
exports.getOne = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findOne({
    vehicleId: req.params.vehicleId,
    ownerId:   req.user._id,
  }).lean();

  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  res.json(vehicle);
});

// ── UPDATE ────────────────────────────────────────────
exports.update = asyncHandler(async (req, res) => {
  const allowed = ['name','make','model','color','year','isPublic','destination','fleetId'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const vehicle = await Vehicle.findOneAndUpdate(
    { vehicleId: req.params.vehicleId, ownerId: req.user._id },
    updates,
    { new: true, runValidators: true }
  );

  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  res.json({ message: 'Vehicle updated', vehicle });
});

// ── UPDATE STATUS ─────────────────────────────────────
exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const vehicle = await Vehicle.findOneAndUpdate(
    { vehicleId: req.params.vehicleId, ownerId: req.user._id },
    { status, lastSeen: new Date() },
    { new: true }
  );

  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

  // Notify WebSocket subscribers of status change
  const io = req.app.get('io');
  io.to(`vehicle:${vehicle.vehicleId}`).emit('status-changed', {
    vehicleId: vehicle.vehicleId,
    status,
    timestamp: new Date(),
  });

  res.json({ message: 'Status updated', vehicle });
});

// ── REMOVE ────────────────────────────────────────────
exports.remove = asyncHandler(async (req, res) => {
  const result = await Vehicle.deleteOne({
    vehicleId: req.params.vehicleId,
    ownerId:   req.user._id,
  });

  if (!result.deletedCount) return res.status(404).json({ error: 'Vehicle not found' });
  res.json({ message: 'Vehicle removed successfully' });
});

// ── SEARCH BY PLATE ───────────────────────────────────
exports.searchByPlate = asyncHandler(async (req, res) => {
  const plate = req.params.plate.toUpperCase().replace(/\s/g, '');

  const vehicle = await Vehicle.findOne({ plate }).lean();
  if (!vehicle) return res.status(404).json({ error: `No vehicle found with plate ${plate}` });

  // Only return public info if not the owner
  const isOwner = vehicle.ownerId.toString() === req.user._id.toString();
  if (!isOwner && !vehicle.isPublic) {
    // Return limited info for privacy
    return res.json({ plate: vehicle.plate, type: vehicle.type, status: vehicle.status });
  }

  res.json(vehicle);
});
