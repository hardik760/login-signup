// routes/buses.js
'use strict';
const router = require('express').Router();
const asyncHandler = require('../middleware/asyncHandler');
const { Vehicle, LocationLog } = require('../models');

router.get('/nearby', asyncHandler(async (req, res) => {
  const { lat, lng, destination } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const buses  = await Vehicle.find({ isPublic: true, type: 'bus', status: 'active' }).lean();
  const busIds = buses.map(b => b.vehicleId);
  const since  = new Date(Date.now() - 120 * 1000);

  const locs = await LocationLog.aggregate([
    { $match: { vehicleId: { $in: busIds }, timestamp: { $gte: since } } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: '$vehicleId', lat: { $first: '$lat' }, lng: { $first: '$lng' }, speed: { $first: '$speed' } } },
  ]);

  const locMap = Object.fromEntries(locs.map(l => [l._id, l]));

  const result = buses.filter(b => locMap[b.vehicleId]).map(b => {
    const loc = locMap[b.vehicleId];
    const distKm = Math.sqrt(Math.pow((loc.lat - lat) * 111, 2) + Math.pow((loc.lng - lng) * 111, 2));
    return {
      vehicleId: b.vehicleId, plate: b.plate, destination: b.destination,
      lat: loc.lat, lng: loc.lng, speed: loc.speed,
      distanceM: Math.round(distKm * 1000),
      goingYourWay: destination ? b.destination?.toLowerCase().includes(destination.toLowerCase()) : false,
      etaMinutes: loc.speed > 0 ? Math.round((distKm / loc.speed) * 60) : null,
    };
  }).sort((a, b) => a.distanceM - b.distanceM).slice(0, 20);

  res.json({ data: result, count: result.length });
}));

module.exports = router;
