// ═══════════════════════════════════════════════════════════════
// services/redis.js
//
// WHY REDIS IN THIS APP:
//   1. Current vehicle location (hot data) — GET in ~0.2ms vs 20ms DB
//   2. Per-vehicle throttle counters — prevent GPS spam
//   3. Dead-zone cache — skip DB write if vehicle hasn't moved
//   4. Rate limit counters — shared across all cluster workers
//   5. WebSocket adapter — lets multiple Node workers share rooms
//
// WITHOUT REDIS: every location read hits MongoDB
// WITH REDIS:    MongoDB only gets writes, reads are instant cache
// ═══════════════════════════════════════════════════════════════
'use strict';

const { createClient } = require('redis');
let client = null;
let isReady = false;

// ── Connect ───────────────────────────────────────────
async function connect() {
  if (!process.env.REDIS_URL) {
    console.warn('[Redis] No REDIS_URL — using in-memory fallback (dev only)');
    client = buildMemoryFallback();
    isReady = true;
    return;
  }

  client = createClient({
    url: process.env.REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) return new Error('Redis: too many retries');
        return Math.min(retries * 200, 3000); // backoff up to 3s
      },
      connectTimeout: 5000,
    },
  });

  client.on('error',        (e)  => { console.error('[Redis] Error:', e.message); isReady = false; });
  client.on('connect',      ()   => console.log('[Redis] Connected'));
  client.on('ready',        ()   => { isReady = true; console.log('[Redis] Ready'); });
  client.on('reconnecting', ()   => console.warn('[Redis] Reconnecting...'));
  client.on('end',          ()   => { isReady = false; });

  await client.connect();
}

// ── Get client (always call this, never import client directly) ─
function getClient() { return client; }
function getIsReady() { return isReady; }

// ═══════════════════════════════════════════════════════════════
// LOCATION CACHE
// Stores current GPS position per vehicle
// TTL = 5 minutes — auto-expires stale vehicles
// ═══════════════════════════════════════════════════════════════
async function cacheLocation(vehicleId, payload) {
  if (!isReady) return false;
  try {
    await client.setEx(
      `loc:${vehicleId}`,
      300,  // 5 minutes TTL
      typeof payload === 'string' ? payload : JSON.stringify(payload)
    );
    return true;
  } catch (e) {
    console.error('[Redis] cacheLocation error:', e.message);
    return false;
  }
}

async function getCachedLocation(vehicleId) {
  if (!isReady) return null;
  try {
    const raw = await client.get(`loc:${vehicleId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// BATCH PIPELINE
// Writes N cache entries in ONE Redis round-trip
// vs N separate setEx calls = N round-trips
// ═══════════════════════════════════════════════════════════════
async function cacheBatchLocations(updates) {
  if (!isReady || !updates.length) return;
  try {
    const pipeline = client.multi(); // Pipeline = queue commands, send once
    updates.forEach(u => {
      pipeline.setEx(`loc:${u.vehicleId}`, 300, JSON.stringify(u));
    });
    await pipeline.exec();
  } catch (e) {
    console.error('[Redis] cacheBatchLocations error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// PER-VEHICLE THROTTLE
// Prevents a single device from sending more than 5 pings/sec
// Uses Redis atomic INCR + EXPIRE
// ═══════════════════════════════════════════════════════════════
async function isVehicleThrottled(vehicleId, maxPerSec = 5) {
  if (!isReady) return false; // Can't throttle without Redis — allow
  try {
    const key   = `throttle:${vehicleId}`;
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, 1); // Set 1s window on first hit
    return count > maxPerSec;
  } catch (e) {
    return false; // Redis error — fail open (allow request)
  }
}

// ═══════════════════════════════════════════════════════════════
// DEAD-ZONE CHECK
// Returns true if vehicle has moved ≥ minMeters since last ping
// Skipping stationary pings cuts DB writes by ~70%
// ═══════════════════════════════════════════════════════════════
async function hasMovedEnough(vehicleId, newLat, newLng, minMeters = 10) {
  const prev = await getCachedLocation(vehicleId);
  if (!prev) return true; // No history — always accept first ping

  // Fast approximate distance (good enough for 10m threshold)
  const dLat = (newLat - prev.lat) * 111000;
  const dLng = (newLng - prev.lng) * 111000 * Math.cos(prev.lat * Math.PI / 180);
  const dist = Math.sqrt(dLat * dLat + dLng * dLng);

  return dist >= minMeters;
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY FALLBACK (when Redis is not available)
// Implements the same API so the rest of the app doesn't care
// ═══════════════════════════════════════════════════════════════
function buildMemoryFallback() {
  const store = new Map();
  const counters = new Map();

  return {
    isMemoryFallback: true,
    get: async (key) => {
      const item = store.get(key);
      if (!item) return null;
      if (item.expiresAt && Date.now() > item.expiresAt) { store.delete(key); return null; }
      return item.value;
    },
    set:   async (key, val) => { store.set(key, { value: val }); },
    setEx: async (key, ttl, val) => { store.set(key, { value: val, expiresAt: Date.now() + ttl * 1000 }); },
    del:   async (key) => { store.delete(key); },
    incr:  async (key) => {
      const n = (counters.get(key) || 0) + 1;
      counters.set(key, n);
      return n;
    },
    expire: async (key, ttl) => {
      setTimeout(() => counters.delete(key), ttl * 1000);
    },
    multi: () => {
      const ops = [];
      const pipe = {
        setEx: (k, t, v) => { ops.push(['setEx', k, t, v]); return pipe; },
        exec:  async () => { ops.forEach(([, k, t, v]) => store.set(k, { value: v, expiresAt: Date.now() + t * 1000 })); return []; },
      };
      return pipe;
    },
  };
}

module.exports = {
  connect,
  getClient,
  getIsReady,
  cacheLocation,
  getCachedLocation,
  cacheBatchLocations,
  isVehicleThrottled,
  hasMovedEnough,
};
