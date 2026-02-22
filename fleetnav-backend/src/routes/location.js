// ═══════════════════════════════════════════════════════
// routes/location.js
// CRITICAL NOTE: batch route MUST be registered BEFORE
// /:vehicleId routes or Express will try to match
// "batch" as a vehicleId — this was a bug in the old code!
// ═══════════════════════════════════════════════════════
'use strict';

const router             = require('express').Router();
const locationController = require('../controllers/locationController');
const auth               = require('../middleware/auth');
const rateLimiters       = require('../middleware/rateLimiter');
const { validate, schemas } = require('../validators');

// ── BATCH (static path — MUST be first!) ─────────────
// One call handles 1000 vehicles: solves the crash issue
router.post(
  '/batch/locations',
  validate(schemas.locationBatch),
  locationController.batchLocations
);

// ── Single vehicle location ───────────────────────────
// Rate limited: max 10 pings/sec per vehicle
router.post(
  '/:vehicleId/location',
  rateLimiters.location,
  validate(schemas.locationPing),
  locationController.pushLocation
);

router.get('/:vehicleId/location', auth, locationController.getLocation);
router.get('/:vehicleId/history',  auth, locationController.getHistory);

module.exports = router;
