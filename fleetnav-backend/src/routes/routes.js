// routes/routes.js
'use strict';
const router       = require('express').Router();
const asyncHandler = require('../middleware/asyncHandler');
const { RouteReport } = require('../models');

router.get('/suggest', asyncHandler(async (req, res) => {
  const { fromLat, fromLng, toLat, toLng } = req.query;
  if (!fromLat || !fromLng || !toLat || !toLng)
    return res.status(400).json({ error: 'All 4 coordinates required' });

  const since   = new Date(Date.now() - 6 * 3600 * 1000);
  const reports = await RouteReport.countDocuments({ createdAt: { $gte: since } });

  res.json({
    routes: [
      { id:'bypass', name:'Bypass Highway',  distanceKm:12.3, durationMin:18, trafficLevel:'low',    safetyScore:94, accidentsLast6Mo:2,  hasConstruction:false, recommended:true,  color:'#22c55e', coordinates:[[+fromLat,+fromLng],[+toLat-0.01,+toLng+0.01],[+toLat,+toLng]] },
      { id:'city',   name:'City Centre',     distanceKm:8.7,  durationMin:24, trafficLevel:'medium', safetyScore:68, accidentsLast6Mo:7,  hasConstruction:false, recommended:false, color:'#f59e0b', coordinates:[[+fromLat,+fromLng],[+toLat+0.005,+toLng-0.005],[+toLat,+toLng]] },
      { id:'fast',   name:'Highway Express', distanceKm:9.2,  durationMin:14, trafficLevel:'high',   safetyScore:45, accidentsLast6Mo:14, hasConstruction:true,  recommended:false, color:'#ef4444', coordinates:[[+fromLat,+fromLng],[+toLat+0.01,+toLng+0.01],[+toLat,+toLng]] },
    ],
    activeHazardReports: reports,
  });
}));

module.exports = router;
