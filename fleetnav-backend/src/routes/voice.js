// routes/voice.js
'use strict';
const router       = require('express').Router();
const asyncHandler = require('../middleware/asyncHandler');
const { RouteReport } = require('../models');

function buildMsg(type, distM) {
  const d = distM < 100 ? 'immediately ahead' : `${distM} meters ahead`;
  const msgs = {
    accident:     `Caution — Accident ${d}. Slow down now.`,
    traffic:      `Heavy traffic ${d}. Expect delays.`,
    construction: `Road construction ${d}. Reduce speed.`,
    pothole:      `Pothole reported ${d}. Drive carefully.`,
    harassment:   `Safety alert ${d}. Stay alert.`,
    flooding:     `Road flooding ${d}. Avoid if possible.`,
    other:        `Road hazard ${d}. Proceed with caution.`,
  };
  return msgs[type] || msgs.other;
}

router.get('/alerts', asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const reports = await RouteReport.find({ expiresAt: { $gt: new Date() } }).lean();

  const alerts = reports
    .map(r => ({
      ...r,
      distM: Math.round(Math.sqrt(
        Math.pow((r.lat - lat) * 111000, 2) + Math.pow((r.lng - lng) * 111000, 2)
      ))
    }))
    .filter(r => r.distM < 1000)
    .sort((a, b) => a.distM - b.distM)
    .map(r => ({
      type:     r.type,
      severity: r.severity,
      distM:    r.distM,
      message:  buildMsg(r.type, r.distM),
    }));

  res.json({ alerts });
}));

module.exports = router;
