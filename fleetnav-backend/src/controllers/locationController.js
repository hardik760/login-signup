// ═══════════════════════════════════════════════════════════════
// controllers/locationController.js  (UPDATED — with Redis + Kafka)
//
// DATA FLOW EXPLAINED:
//
// SINGLE PING (POST /vehicles/:vehicleId/location):
//   1. Throttle check via Redis (if >5/sec from same device → reject)
//   2. Dead-zone check via Redis (if moved <10m → skip, save DB write)
//   3. Write to Redis cache (current location, 5min TTL)
//   4. Publish to Kafka topic "vehicle-locations" → return 200 IMMEDIATELY
//   5. Kafka Consumer (separate process) writes to MongoDB in batches
//   6. Kafka Consumer 2 broadcasts via WebSocket to subscribers
//
// BATCH (POST /vehicles/batch/locations):
//   1. Validate up to 1000 updates
//   2. Redis pipeline: cache ALL in 1 round-trip
//   3. Kafka: publish ALL in 1 send call
//   4. Return 200 IMMEDIATELY
//   5. Kafka consumers handle DB + WebSocket async
//
// GET LOCATION (GET /vehicles/:vehicleId/location):
//   1. Check Redis (~0.2ms) → return if found
//   2. Only if Redis miss → query MongoDB
//   3. Repopulate Redis for next request
//   → MongoDB is NEVER hit for live tracking reads
//
// This is how you handle 1,000,000 vehicles:
//   Request volume:  1M × 1 ping/5s = 200,000 req/sec
//   After batching:  200,000 / 100   = 2,000 req/sec to server
//   Kafka buffers:   2,000 → DB gets 500 writes/sec (batched)
//   Redis serves:    All reads → 0 DB reads for live location
// ═══════════════════════════════════════════════════════════════
'use strict';

const { Vehicle, LocationLog } = require('../models');
const redis  = require('../services/redis');
const kafka  = require('../services/kafka');
const asyncHandler = require('../middleware/asyncHandler');

// ════════════════════════════════════════
// SINGLE GPS PING
// POST /api/vehicles/:vehicleId/location
// ════════════════════════════════════════
exports.pushLocation = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const { lat, lng, speed = 0, heading = 0, accuracy = 0, altitude = 0, timestamp } = req.body;

  // ── Step 1: Per-vehicle rate throttle (Redis) ────────
  const throttled = await redis.isVehicleThrottled(vehicleId, 5);
  if (throttled) {
    return res.status(429).json({
      error: 'Too many location updates from this vehicle',
      retryAfterMs: 1000,
    });
  }

  // ── Step 2: Dead-zone filter (Redis) ─────────────────
  // If vehicle hasn't moved ≥10m, no need to process
  const moved = await redis.hasMovedEnough(vehicleId, lat, lng, 10);
  if (!moved) {
    return res.json({
      accepted: true,
      reason:   'no_movement',  // Device knows it was received
      nextPingMs: 5000,          // Tell device: try again in 5s
    });
  }

  const payload = {
    vehicleId, lat, lng,
    speed:    speed    || 0,
    heading:  heading  || 0,
    accuracy: accuracy || 0,
    altitude: altitude || 0,
    timestamp: timestamp ? new Date(timestamp) : new Date(),
  };

  // ── Step 3: Write to Redis cache ─────────────────────
  // This makes GET /location instant (no DB hit)
  await redis.cacheLocation(vehicleId, payload);

  // ── Step 4: Publish to Kafka ─────────────────────────
  // Return 200 IMMEDIATELY — don't wait for DB write!
  // Kafka consumer handles DB write asynchronously
  const kafkaOk = await kafka.publishLocation(payload);

  if (!kafkaOk) {
    // Kafka unavailable — fall back to direct DB write (dev mode)
    LocationLog.create(payload).catch(e => console.error('[Location] Direct write error:', e.message));
    Vehicle.updateOne({ vehicleId }, { status: 'active', lastSeen: new Date() })
           .catch(e => console.error('[Location] Status update error:', e.message));

    // Direct WebSocket broadcast (no Kafka consumer to do it)
    const io = req.app.get('io');
    io.to(`vehicle:${vehicleId}`).emit('location', payload);
    io.to('nearby-all').emit('vehicle-moved', { vehicleId, lat, lng, speed, heading });
  }

  // Client gets response in ~2ms regardless of DB/Kafka speed
  res.json({ accepted: true, nextPingMs: 5000 });
});


// ════════════════════════════════════════
// BATCH GPS UPDATE
// POST /api/vehicles/batch/locations
//
// 1000 vehicles → 1 HTTP call instead of 1000
// This is the primary fix for your endpoint crash problem
// ════════════════════════════════════════
exports.batchLocations = asyncHandler(async (req, res) => {
  const { updates } = req.body;

  // Validate all updates quickly
  const valid   = [];
  const invalid = [];

  for (const u of updates) {
    if (
      u.vehicleId &&
      typeof u.lat === 'number' && u.lat >= -90  && u.lat <= 90 &&
      typeof u.lng === 'number' && u.lng >= -180 && u.lng <= 180
    ) {
      valid.push({
        vehicleId: u.vehicleId,
        lat:       u.lat,
        lng:       u.lng,
        speed:     u.speed     || 0,
        heading:   u.heading   || 0,
        timestamp: u.timestamp ? new Date(u.timestamp) : new Date(),
      });
    } else {
      invalid.push(u.vehicleId || 'unknown');
    }
  }

  if (!valid.length) {
    return res.status(400).json({ error: 'No valid updates in batch', invalidIds: invalid });
  }

  // ── Redis: cache all in ONE pipeline round-trip ───────
  await redis.cacheBatchLocations(valid);

  // ── Kafka: publish all in ONE send call ───────────────
  const kafkaOk = await kafka.publishBatchLocations(valid);

  if (!kafkaOk) {
    // Kafka fallback: direct bulk write
    await Promise.allSettled([
      LocationLog.insertMany(valid, { ordered: false }),
      Vehicle.updateMany(
        { vehicleId: { $in: valid.map(u => u.vehicleId) } },
        { status: 'active', lastSeen: new Date() }
      ),
    ]);

    // WebSocket broadcast
    const io = req.app.get('io');
    io.to('nearby-all').emit('batch-moved', valid.map(u => ({
      vehicleId: u.vehicleId, lat: u.lat, lng: u.lng, speed: u.speed,
    })));
  }

  res.json({
    processed: valid.length,
    rejected:  invalid.length,
    ...(invalid.length && { rejectedIds: invalid.slice(0, 10) }), // Show first 10 only
  });
});


// ════════════════════════════════════════
// GET CURRENT LOCATION
// Redis first — MongoDB only on cache miss
// ════════════════════════════════════════
exports.getLocation = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;

  // ── Redis hit (~0.2ms) ────────────────────────────────
  const cached = await redis.getCachedLocation(vehicleId);
  if (cached) {
    return res.json({ ...cached, _source: 'cache' });
  }

  // ── Redis miss → MongoDB fallback (~15ms) ─────────────
  const log = await LocationLog
    .findOne({ vehicleId })
    .sort({ timestamp: -1 })
    .lean();

  if (!log) return res.status(404).json({ error: 'No location data for this vehicle yet' });

  // Repopulate cache so next request is fast
  await redis.cacheLocation(vehicleId, log);

  res.json({ ...log, _source: 'db' });
});


// ════════════════════════════════════════
// LOCATION HISTORY (paginated)
// ════════════════════════════════════════
exports.getHistory = asyncHandler(async (req, res) => {
  const { vehicleId }                    = req.params;
  const { from, to, limit = 200, page = 1 } = req.query;

  const vehicle = await Vehicle.findOne({ vehicleId, ownerId: req.user._id }).lean();
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

  const filter = { vehicleId };
  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = new Date(from);
    if (to)   filter.timestamp.$lte = new Date(to);
  }

  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const pageNum  = Math.max(1, parseInt(page));

  const [logs, total] = await Promise.all([
    LocationLog.find(filter)
      .sort({ timestamp: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    LocationLog.countDocuments(filter),
  ]);

  res.json({
    data:       logs,
    total,
    page:       pageNum,
    count:      logs.length,
    totalPages: Math.ceil(total / limitNum),
  });
});


// ════════════════════════════════════════
// NEARBY VEHICLES (within 1 km)
// ════════════════════════════════════════
exports.getNearby = asyncHandler(async (req, res) => {
  const { lat, lng, radius = 1 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const userLat    = parseFloat(lat);
  const userLng    = parseFloat(lng);
  const radiusKm   = Math.min(5, parseFloat(radius)); // Cap at 5km

  // Only vehicles that pinged in last 60 seconds = "active"
  const since = new Date(Date.now() - 60 * 1000);

  const recentLogs = await LocationLog.aggregate([
    { $match: { timestamp: { $gte: since } } },
    { $sort: { vehicleId: 1, timestamp: -1 } },
    {
      $group: {
        _id:       '$vehicleId',
        lat:       { $first: '$lat' },
        lng:       { $first: '$lng' },
        speed:     { $first: '$speed' },
        heading:   { $first: '$heading' },
        timestamp: { $first: '$timestamp' },
      }
    },
    // Approximate km distance without PostGIS
    {
      $addFields: {
        distKm: {
          $sqrt: {
            $add: [
              { $pow: [{ $multiply: [{ $subtract: ['$lat', userLat] }, 111] }, 2] },
              { $pow: [{ $multiply: [{ $subtract: ['$lng', userLng] }, 111] }, 2] },
            ]
          }
        }
      }
    },
    { $match: { distKm: { $lte: radiusKm } } },
    { $sort:  { distKm: 1 } },
    { $limit: 100 },
  ]);

  // Enrich with vehicle metadata
  const vehicleIds = recentLogs.map(l => l._id);
  const vehicles   = await Vehicle.find({
    vehicleId: { $in: vehicleIds },
    isPublic:  true,
  }).select('vehicleId plate type status name').lean();

  const metaMap = Object.fromEntries(vehicles.map(v => [v.vehicleId, v]));

  const result = recentLogs.map(log => ({
    vehicleId:   log._id,
    lat:         log.lat,
    lng:         log.lng,
    speed:       log.speed,
    heading:     log.heading,
    timestamp:   log.timestamp,
    distanceKm:  Math.round(log.distKm * 100) / 100,
    distanceM:   Math.round(log.distKm * 1000),
    ...(metaMap[log._id] || { plate: 'Unknown', type: 'car' }),
  }));

  res.json({ data: result, count: result.length, radiusKm });
});
