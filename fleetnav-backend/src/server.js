// ═══════════════════════════════════════════════════════════════
// server.js — Boot sequence with Redis + Kafka
// ═══════════════════════════════════════════════════════════════
'use strict';
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');

const connectDB = require('./config/database');
const redis        = require('./services/redis');
const kafka        = require('./services/kafka');
const socketHandler = require('../websockets/socketHandler');
const errorHandler  = require('./middleware/errorHandler');
const rateLimiters  = require('./middleware/rateLimiter');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true },
  pingTimeout:  20000,
  pingInterval: 10000,
});
app.set('io', io);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '5mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Rate limiters
app.use('/api/', rateLimiters.global);
app.use('/api/auth/', rateLimiters.auth);

// Routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/vehicles', require('./routes/location'));   // batch FIRST (inside this file)
app.use('/api/nearby',   require('./routes/nearby'));
app.use('/api/routes',   require('./routes/routes'));
app.use('/api/reports',  require('./routes/reports'));
app.use('/api/sos',      require('./routes/sos'));
app.use('/api/buses',    require('./routes/buses'));
app.use('/api/voice',    require('./routes/voice'));

app.get('/health', (req, res) => res.json({
  status:       'ok',
  pid:          process.pid,
  redis:        redis.getIsReady(),
  kafka:        kafka.isReady(),
  ws:           io.engine.clientsCount,
  uptime:       Math.round(process.uptime()),
}));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

socketHandler(io);

// ── BOOT SEQUENCE ─────────────────────────────────────
async function boot() {
  console.log('\n🛰️  FleetNav Starting...\n');

  // 1. MongoDB (required)
  await connectDB();

  // 2. Redis (optional — falls back to memory)
  await redis.connect();

  // 3. Kafka Producer (optional — falls back to direct writes)
  await kafka.connectProducer();

  // 4. Kafka Consumers (only start if Kafka is available)
  if (process.env.KAFKA_BROKERS) {
    const { LocationLog, Vehicle } = require('./models');

    // Consumer 1: Write batched locations to MongoDB
    await kafka.startLocationDbWriter(LocationLog, Vehicle);

    // Consumer 2: Broadcast updates via WebSocket
    await kafka.startWebSocketFanout(io);

    // Consumer 3: Process route alerts for voice assistant
    await kafka.startAlertProcessor(io);
  }

  // 5. Start HTTP server
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`\n✅ Server running on :${PORT}`);
    console.log(`✅ Redis: ${redis.getIsReady() ? 'connected' : 'memory fallback'}`);
    console.log(`✅ Kafka: ${kafka.isReady() ? 'connected' : 'direct write fallback'}`);
    console.log(`✅ WebSocket ready\n`);
    console.log('📡 KEY ENDPOINTS:');
    console.log('   POST /api/vehicles                     → register any vehicle (dynamic)');
    console.log('   POST /api/vehicles/:vehicleId/location → single GPS ping');
    console.log('   POST /api/vehicles/batch/locations     → up to 1000 vehicles in 1 call');
    console.log('   GET  /api/vehicles/:vehicleId/location → current location (Redis-first)');
    console.log('   GET  /api/nearby?lat=&lng=             → vehicles within 1km\n');
  });

  // Graceful shutdown
  const shutdown = async (sig) => {
    console.log(`\n${sig} received — shutting down gracefully...`);
    server.close(async () => {
      await kafka.shutdown();
      const mongoose = require('mongoose');
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000); // Force kill after 10s
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('uncaughtException',  (err) => { console.error('Uncaught:', err); });
  process.on('unhandledRejection', (err) => { console.error('Unhandled rejection:', err); });
}

boot().catch(err => {
  console.error('❌ Boot failed:', err.message);
  process.exit(1);
});

module.exports = { app, server, io };
