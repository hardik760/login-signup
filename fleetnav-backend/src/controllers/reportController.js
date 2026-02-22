// ═══════════════════════════════════════════════════════
// controllers/reportController.js
// ═══════════════════════════════════════════════════════
'use strict';
const { RouteReport } = require('../models');
const asyncHandler = require('../middleware/asyncHandler');

exports.create = asyncHandler(async (req, res) => {
  const { type, reason, lat, lng, severity } = req.body;

  const report = await RouteReport.create({
    reporterId: req.user._id,
    type, reason: reason.trim(),
    lat: +lat, lng: +lng,
    severity: severity || 'medium',
  });

  // Alert all nearby users via WebSocket
  const io = req.app.get('io');
  io.to('nearby-all').emit('new-hazard', {
    type, lat: +lat, lng: +lng, severity: severity || 'medium',
    message: `${type} reported nearby`,
    reportId: report._id,
  });

  res.status(201).json({ message: 'Report submitted. Thank you for keeping roads safe!', report });
});

exports.getNearby = asyncHandler(async (req, res) => {
  const { lat, lng, radius = 2 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const reports = await RouteReport.find({ expiresAt: { $gt: new Date() } }).lean();

  const nearby = reports.filter(r => {
    const dist = Math.sqrt(
      Math.pow((r.lat - lat) * 111, 2) + Math.pow((r.lng - lng) * 111, 2)
    );
    return dist <= radius;
  });

  res.json({ data: nearby, count: nearby.length });
});

exports.upvote = asyncHandler(async (req, res) => {
  const report = await RouteReport.findByIdAndUpdate(
    req.params.id,
    { $inc: { upvotes: 1 } },
    { new: true }
  );
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json({ message: 'Upvoted', upvotes: report.upvotes });
});
