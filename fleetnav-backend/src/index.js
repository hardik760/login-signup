// ═══════════════════════════════════════════════════════
// FleetNav — Entry Point
// Cluster mode: forks one worker per CPU core
// Each worker runs a full Express + Socket.io server
// ═══════════════════════════════════════════════════════
'use strict';

const cluster = require('cluster');
const os = require('os');

const WORKERS = process.env.NODE_ENV === 'production'
  ? os.cpus().length   // All cores in production
  : 1;                 // Single worker in dev (easier debugging)

if (cluster.isMaster && process.env.NODE_ENV === 'production') {
  console.log(`[Master] PID ${process.pid} — Forking ${WORKERS} workers`);

  for (let i = 0; i < WORKERS; i++) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Master] Worker ${worker.id} died (code=${code}, signal=${signal}). Restarting...`);
    cluster.fork(); // Auto-restart dead worker
  });

  cluster.on('online', (worker) => {
    console.log(`[Master] Worker ${worker.id} online`);
  });

} else {
  // Worker — starts the actual HTTP server
  require('./server');
}
