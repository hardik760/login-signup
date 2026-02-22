// ═══════════════════════════════════════════════════════
// config/redis.js
// Redis client — used for:
//   • Caching current vehicle locations (hot data)
//   • Rate limit counters
//   • WebSocket room data (when using Redis adapter)
//   • Throttle checks per vehicle
// ═══════════════════════════════════════════════════════
'use strict';

let redis = null;

async function connectRedis() {
  // If no Redis URL, run in no-cache mode (dev/testing)
  if (!process.env.REDIS_URL) {
    console.warn('[Redis] REDIS_URL not set — running without cache (dev mode)');
    redis = createNoOpClient();
    return;
  }

  try {
    const { createClient } = require('redis');
    redis = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        connectTimeout: 5000,
      }
    });

    redis.on('error', (err) => console.error('[Redis] Error:', err.message));
    redis.on('connect', () => console.log('[Redis] Connected'));
    redis.on('reconnecting', () => console.warn('[Redis] Reconnecting...'));

    await redis.connect();
  } catch (err) {
    console.warn('[Redis] Could not connect — falling back to no-cache mode:', err.message);
    redis = createNoOpClient();
  }
}

// No-op client — mimics Redis API but does nothing
// Lets the app run without Redis in development
function createNoOpClient() {
  return {
    get:    async () => null,
    set:    async () => null,
    setEx:  async () => null,
    del:    async () => null,
    exists: async () => 0,
    incr:   async () => 1,
    expire: async () => null,
    pipeline: () => ({ setEx: () => {}, exec: async () => [] }),
    isReady: false,
  };
}

function getRedis() {
  return redis;
}

module.exports = connectRedis;
module.exports.getRedis = getRedis;
