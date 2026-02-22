// ═══════════════════════════════════════════════════════
// config/database.js
// MongoDB connection with connection pooling
// ═══════════════════════════════════════════════════════
'use strict';

const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not defined in .env');

  await mongoose.connect(uri, {
    // Connection pool — keeps N connections open and ready
    // Eliminates the overhead of creating a new connection per request
    maxPoolSize:              50,   // Max simultaneous connections
    minPoolSize:              5,    // Always keep 5 warm connections
    maxIdleTimeMS:        30000,   // Close idle connections after 30s
    serverSelectionTimeoutMS: 5000, // Fail fast if no server found
    socketTimeoutMS:      45000,   // Abandon slow queries
    connectTimeoutMS:     10000,
    heartbeatFrequencyMS:  10000,
  });

  isConnected = true;
  console.log(`[DB] Connected to MongoDB (pool: 5–50 connections)`);

  mongoose.connection.on('error', (err) => {
    console.error('[DB] Connection error:', err.message);
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] Disconnected. Reconnecting...');
    isConnected = false;
  });
}

module.exports = connectDB;
