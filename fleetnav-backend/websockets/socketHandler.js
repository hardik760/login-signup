// ═══════════════════════════════════════════════════════
// websockets/socketHandler.js
// Real-time WebSocket engine
// Handles: vehicle tracking subscriptions, location push,
//          fleet rooms, SOS broadcast, nearby alerts
// ═══════════════════════════════════════════════════════
'use strict';

const jwt          = require('jsonwebtoken');
const { LocationLog, Vehicle } = require('../src/models');
const { getRedis } = require('../src/config/redis');

module.exports = function setupSockets(io) {

  // ── Auth middleware for WebSocket ─────────────────────
  // Runs once when client connects
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      // Allow anonymous connection for public data (nearby vehicles map)
      socket.userId    = null;
      socket.isAnon    = true;
      return next();
    }

    try {
      const decoded    = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId    = decoded.id;
      socket.isAnon    = false;
      next();
    } catch (err) {
      // Invalid token — allow as anonymous
      socket.userId    = null;
      socket.isAnon    = true;
      next();
    }
  });

  // ── Connection ────────────────────────────────────────
  io.on('connection', (socket) => {

    // Every connected client joins the global nearby room
    // SOS and hazard alerts go to this room
    socket.join('nearby-all');

    // ── Subscribe to a specific vehicle ─────────────────
    // Client sends: socket.emit('subscribe:vehicle', 'veh_abc123')
    // Server pushes: socket.on('location', (data) => ...)
    socket.on('subscribe:vehicle', async (vehicleId) => {
      if (!vehicleId || typeof vehicleId !== 'string') return;
      socket.join(`vehicle:${vehicleId}`);

      // Immediately send last known location from Redis cache
      const redis  = getRedis();
      const cached = await redis.get(`loc:${vehicleId}`).catch(() => null);

      if (cached) {
        socket.emit('location', JSON.parse(cached));
      } else {
        // Fall back to DB
        const log = await LocationLog.findOne({ vehicleId }).sort({ timestamp: -1 }).lean();
        if (log) socket.emit('location', log);
      }
    });

    socket.on('unsubscribe:vehicle', (vehicleId) => {
      if (vehicleId) socket.leave(`vehicle:${vehicleId}`);
    });

    // ── Subscribe to a fleet ─────────────────────────────
    socket.on('subscribe:fleet', (fleetId) => {
      if (fleetId) socket.join(`fleet:${fleetId}`);
    });

    // ── Client pushes its own location ──────────────────
    // Mobile app uses this instead of HTTP POST for lower overhead
    // Works even with spotty connections (WS reconnects automatically)
    socket.on('push:location', async (data) => {
      if (!socket.userId) return; // Must be authenticated to push

      const { vehicleId, lat, lng, speed = 0, heading = 0 } = data;
      if (!vehicleId || lat == null || lng == null) return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      const payload = { vehicleId, lat, lng, speed, heading, timestamp: new Date() };

      // Cache in Redis
      const redis = getRedis();
      await redis.setEx(`loc:${vehicleId}`, 300, JSON.stringify(payload)).catch(() => {});

      // Async DB write — don't block the WebSocket event loop
      setImmediate(() => {
        LocationLog.create(payload).catch(e => console.error('[WS] Location DB write:', e.message));
        Vehicle.updateOne({ vehicleId }, { status: 'active', lastSeen: new Date() })
          .catch(e => console.error('[WS] Vehicle status update:', e.message));
      });

      // Broadcast to subscribers
      io.to(`vehicle:${vehicleId}`).emit('location', payload);
      io.to('nearby-all').emit('vehicle-moved', { vehicleId, lat, lng, speed, heading });
    });

    // ── Client asks for nearby vehicles snapshot ─────────
    socket.on('get:nearby', async ({ lat, lng }) => {
      if (!lat || !lng) return;

      const since = new Date(Date.now() - 60 * 1000);
      const logs  = await LocationLog.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $sort: { timestamp: -1 } },
        { $group: { _id: '$vehicleId', lat: { $first: '$lat' }, lng: { $first: '$lng' }, speed: { $first: '$speed' } } },
      ]).catch(() => []);

      const nearby = logs.filter(l => {
        const d = Math.sqrt(Math.pow((l.lat - lat) * 111, 2) + Math.pow((l.lng - lng) * 111, 2));
        return d <= 1; // Within 1 km
      });

      socket.emit('nearby:snapshot', { vehicles: nearby, timestamp: new Date() });
    });

    // ── Disconnect — clean up rooms ──────────────────────
    // Without this, socket.io leaks room memberships in memory
    socket.on('disconnect', (reason) => {
      socket.rooms.forEach(room => socket.leave(room));
    });

    // ── Error handling ────────────────────────────────────
    socket.on('error', (err) => {
      console.error(`[WS] Socket error (${socket.id}):`, err.message);
    });
  });

  // ── Server-side periodic cleanup ─────────────────────
  // Remove empty rooms every 5 minutes to prevent memory leak
  setInterval(() => {
    io.sockets.adapter.rooms.forEach((sockets, room) => {
      if (sockets.size === 0) {
        io.sockets.adapter.rooms.delete(room);
      }
    });
  }, 5 * 60 * 1000);

  console.log('[WS] WebSocket handler initialized');
};
