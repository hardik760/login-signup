// ═══════════════════════════════════════════════════════════════
// services/kafka.js
//
// WHY KAFKA IN THIS APP:
//
// WITHOUT KAFKA (your current problem):
//   GPS Device → HTTP POST → Express → MongoDB.insert()
//   At 10,000 vehicles × 1 ping/5s = 2,000 req/sec → MongoDB gets
//   2,000 writes/sec directly → overload → crash
//
// WITH KAFKA:
//   GPS Device → HTTP POST → Express → Kafka (buffer)
//                                            ↓
//                                       Consumer 1: write to MongoDB (batched, 500/sec)
//                                       Consumer 2: broadcast via WebSocket
//                                       Consumer 3: check for alerts/hazards
//
//   Express just "drops the message in the queue" and responds instantly.
//   MongoDB only sees what it can handle. If MongoDB is slow, Kafka buffers
//   the backlog — the GPS device never knows and never crashes.
//
// TOPICS:
//   vehicle-locations  → raw GPS pings from devices
//   vehicle-events     → status changes, SOS, reports
//   route-alerts       → hazard notifications for voice assistant
// ═══════════════════════════════════════════════════════════════
'use strict';

const { Kafka, Partitioners, logLevel } = require('kafkajs');

let producer = null;
let consumers = {};
let isProducerReady = false;

// ── Kafka client setup ────────────────────────────────
function createKafkaClient() {
  return new Kafka({
    clientId: `fleetnav-worker-${process.pid}`,
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
    retry: {
      retries: 8,
      initialRetryTime: 300,
      factor: 0.2,
    },
    connectionTimeout: 10000,
    requestTimeout: 30000,
  });
}

// ── Producer ──────────────────────────────────────────
async function connectProducer() {
  if (!process.env.KAFKA_BROKERS) {
    console.warn('[Kafka] No KAFKA_BROKERS — Kafka disabled (dev mode). Using direct DB writes.');
    producer = buildNoOpProducer();
    isProducerReady = true;
    return;
  }

  try {
    const kafka = createKafkaClient();
    producer = kafka.producer({
      createPartitioner: Partitioners.LegacyPartitioner,
      // These settings prevent data loss on producer side
      allowAutoTopicCreation: true,
      transactionTimeout:    30000,
      idempotent:            false, // Set true for exactly-once (needs acks: -1)
    });

    producer.on('producer.connect',    () => { isProducerReady = true; console.log('[Kafka] Producer connected'); });
    producer.on('producer.disconnect', () => { isProducerReady = false; console.warn('[Kafka] Producer disconnected'); });

    await producer.connect();

    // Ensure topics exist with correct partition count
    // More partitions = higher parallelism = more throughput
    await ensureTopics(kafka);

  } catch (err) {
    console.warn('[Kafka] Producer failed to connect — falling back to direct writes:', err.message);
    producer = buildNoOpProducer();
    isProducerReady = true;
  }
}

// ── Ensure topics are created ─────────────────────────
async function ensureTopics(kafka) {
  const admin = kafka.admin();
  try {
    await admin.connect();
    const existing = await admin.listTopics();

    const needed = [
      {
        topic:             'vehicle-locations',
        numPartitions:     32,    // 32 partitions = 32 parallel consumers max
        replicationFactor: 1,    // Set to 3 in production for fault tolerance
        configEntries: [
          { name: 'retention.ms',    value: String(24 * 60 * 60 * 1000) }, // 24h retention
          { name: 'cleanup.policy',  value: 'delete' },
        ],
      },
      {
        topic:             'vehicle-events',
        numPartitions:     8,
        replicationFactor: 1,
        configEntries: [
          { name: 'retention.ms', value: String(7 * 24 * 60 * 60 * 1000) }, // 7 day retention
        ],
      },
      {
        topic:             'route-alerts',
        numPartitions:     4,
        replicationFactor: 1,
        configEntries: [
          { name: 'retention.ms', value: String(6 * 60 * 60 * 1000) }, // 6h — alerts expire
        ],
      },
    ];

    const toCreate = needed.filter(t => !existing.includes(t.topic));
    if (toCreate.length > 0) {
      await admin.createTopics({ topics: toCreate });
      console.log('[Kafka] Topics created:', toCreate.map(t => t.topic).join(', '));
    }
  } catch (e) {
    console.warn('[Kafka] Could not ensure topics:', e.message);
  } finally {
    await admin.disconnect();
  }
}

// ═══════════════════════════════════════════════════════════════
// PUBLISH: Single location ping
// Key = vehicleId ensures all pings from same vehicle
// land on the SAME partition = ordered processing
// ═══════════════════════════════════════════════════════════════
async function publishLocation(locationData) {
  if (!isProducerReady) return false;
  try {
    await producer.send({
      topic:    'vehicle-locations',
      messages: [{
        key:   locationData.vehicleId,     // Partition key — same vehicle, same partition
        value: JSON.stringify(locationData),
        timestamp: String(Date.now()),
      }],
      acks: 1, // Wait for partition leader to acknowledge (balance speed vs durability)
    });
    return true;
  } catch (e) {
    console.error('[Kafka] publishLocation error:', e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// PUBLISH BATCH: Up to 1000 locations in ONE network call
// This is how you handle 10,000 vehicles without crashing
// ═══════════════════════════════════════════════════════════════
async function publishBatchLocations(updates) {
  if (!isProducerReady || !updates.length) return false;
  try {
    await producer.send({
      topic:    'vehicle-locations',
      // All 1000 messages in one sendBatch call
      messages: updates.map(u => ({
        key:   u.vehicleId,
        value: JSON.stringify(u),
        timestamp: String(Date.now()),
      })),
      acks: 1,
    });
    return true;
  } catch (e) {
    console.error('[Kafka] publishBatch error:', e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// PUBLISH EVENT: Status changes, SOS, hazard reports
// ═══════════════════════════════════════════════════════════════
async function publishEvent(eventType, data) {
  if (!isProducerReady) return false;
  try {
    await producer.send({
      topic: 'vehicle-events',
      messages: [{
        key:   eventType,
        value: JSON.stringify({ eventType, ...data, ts: Date.now() }),
      }],
    });
    return true;
  } catch (e) {
    console.error('[Kafka] publishEvent error:', e.message);
    return false;
  }
}

async function publishAlert(alertData) {
  if (!isProducerReady) return false;
  try {
    await producer.send({
      topic:    'route-alerts',
      messages: [{ key: 'alert', value: JSON.stringify(alertData) }],
    });
    return true;
  } catch (e) {
    console.error('[Kafka] publishAlert error:', e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// CONSUMER: DB WRITER
// Reads from vehicle-locations topic in batches
// Writes to MongoDB using bulk insertMany (much faster than one-by-one)
//
// This consumer is the ONLY thing that writes locations to MongoDB.
// The HTTP endpoint just sends to Kafka and responds immediately.
// MongoDB never gets more than it can handle.
// ═══════════════════════════════════════════════════════════════
async function startLocationDbWriter(LocationLog, Vehicle) {
  if (!process.env.KAFKA_BROKERS) return; // No Kafka — writes handled directly in HTTP handler

  const kafka    = createKafkaClient();
  const consumer = kafka.consumer({
    groupId:          'location-db-writer',
    sessionTimeout:   30000,
    heartbeatInterval: 3000,
    maxBytesPerPartition: 1048576, // 1MB per partition per fetch
  });

  consumers['db-writer'] = consumer;

  await consumer.connect();
  await consumer.subscribe({ topic: 'vehicle-locations', fromBeginning: false });

  await consumer.run({
    // Process entire batches at once — much faster than eachMessage
    eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning }) => {
      if (!isRunning()) return;

      const docs        = [];
      const vehicleIds  = new Set();

      for (const msg of batch.messages) {
        try {
          const data = JSON.parse(msg.value.toString());
          docs.push({
            vehicleId: data.vehicleId,
            lat:       data.lat,
            lng:       data.lng,
            speed:     data.speed   || 0,
            heading:   data.heading || 0,
            accuracy:  data.accuracy || 0,
            altitude:  data.altitude || 0,
            timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
          });
          vehicleIds.add(data.vehicleId);
          resolveOffset(msg.offset);
        } catch (e) {
          console.error('[Kafka Consumer] Parse error:', e.message);
        }
      }

      if (!docs.length) return;

      try {
        // ONE bulk write for up to 500 messages — much better than 500 individual inserts
        await LocationLog.insertMany(docs, { ordered: false });

        // ONE updateMany for all active vehicles in this batch
        await Vehicle.updateMany(
          { vehicleId: { $in: [...vehicleIds] } },
          { status: 'active', lastSeen: new Date() }
        );

        await heartbeat(); // Tell Kafka we're still alive
      } catch (e) {
        // ordered:false means partial success is OK — don't crash on duplicates
        if (e.code !== 11000) {
          console.error('[Kafka Consumer] DB write error:', e.message);
        }
      }
    },
  });

  console.log('[Kafka] DB writer consumer started');
}

// ═══════════════════════════════════════════════════════════════
// CONSUMER: WEBSOCKET FANOUT
// Reads from vehicle-locations and broadcasts to Socket.io rooms
// Separating this from HTTP means WebSocket never blocks HTTP
// ═══════════════════════════════════════════════════════════════
async function startWebSocketFanout(io) {
  if (!process.env.KAFKA_BROKERS) return;

  const kafka    = createKafkaClient();
  const consumer = kafka.consumer({
    groupId: 'websocket-fanout',
    sessionTimeout: 30000,
  });

  consumers['ws-fanout'] = consumer;

  await consumer.connect();
  await consumer.subscribe({ topic: 'vehicle-locations', fromBeginning: false });

  await consumer.run({
    eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
      // Group updates by vehicleId — emit only latest per vehicle per batch
      const latestByVehicle = new Map();

      for (const msg of batch.messages) {
        try {
          const data = JSON.parse(msg.value.toString());
          latestByVehicle.set(data.vehicleId, data); // Overwrites — only latest matters
          resolveOffset(msg.offset);
        } catch (e) { /* skip bad messages */ }
      }

      // Emit one update per vehicle (not one per message — reduces WS traffic)
      for (const [vehicleId, data] of latestByVehicle) {
        io.to(`vehicle:${vehicleId}`).emit('location', data);
      }

      // One bulk emit for all nearby users
      if (latestByVehicle.size > 0) {
        io.to('nearby-all').emit('batch-moved', [...latestByVehicle.values()].map(d => ({
          vehicleId: d.vehicleId, lat: d.lat, lng: d.lng, speed: d.speed || 0, heading: d.heading || 0,
        })));
      }

      await heartbeat();
    },
  });

  console.log('[Kafka] WebSocket fanout consumer started');
}

// ═══════════════════════════════════════════════════════════════
// CONSUMER: ALERT PROCESSOR
// Reads route-alerts and sends voice assistant notifications
// ═══════════════════════════════════════════════════════════════
async function startAlertProcessor(io) {
  if (!process.env.KAFKA_BROKERS) return;

  const kafka    = createKafkaClient();
  const consumer = kafka.consumer({ groupId: 'alert-processor' });

  consumers['alert-processor'] = consumer;

  await consumer.connect();
  await consumer.subscribe({ topic: 'route-alerts', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const alert = JSON.parse(message.value.toString());
        // Broadcast to all users — they filter by proximity client-side
        io.to('nearby-all').emit('route-alert', alert);
      } catch (e) { /* skip */ }
    },
  });

  console.log('[Kafka] Alert processor consumer started');
}

// ── Graceful shutdown ─────────────────────────────────
async function shutdown() {
  try {
    if (producer) await producer.disconnect();
    for (const c of Object.values(consumers)) await c.disconnect();
    console.log('[Kafka] All connections closed');
  } catch (e) {
    console.error('[Kafka] Shutdown error:', e.message);
  }
}

// ── No-op producer (when Kafka unavailable) ───────────
function buildNoOpProducer() {
  return {
    send:      async () => {},
    sendBatch: async () => {},
    disconnect: async () => {},
  };
}

module.exports = {
  connectProducer,
  publishLocation,
  publishBatchLocations,
  publishEvent,
  publishAlert,
  startLocationDbWriter,
  startWebSocketFanout,
  startAlertProcessor,
  shutdown,
  isReady: () => isProducerReady,
};
