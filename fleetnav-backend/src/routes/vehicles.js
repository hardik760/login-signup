// ═══════════════════════════════════════════════════════
// routes/vehicles.js
// All vehicle CRUD — dynamic :vehicleId, zero manual endpoints
// ═══════════════════════════════════════════════════════
'use strict';

const router            = require('express').Router();
const vehicleController = require('../controllers/vehicleController');
const auth              = require('../middleware/auth');
const { validate, schemas } = require('../validators');

// ── Collection routes ─────────────────────────────────
router.get ('/',    auth, vehicleController.list);
router.post('/',    auth, validate(schemas.vehicleCreate), vehicleController.register);

// ── Search by plate (must come before /:vehicleId) ───
router.get('/search/plate/:plate', auth, vehicleController.searchByPlate);

// ── Individual vehicle routes — ONE set for ALL vehicles ─
router.get   ('/:vehicleId', auth, vehicleController.getOne);
router.put   ('/:vehicleId', auth, vehicleController.update);
router.delete('/:vehicleId', auth, vehicleController.remove);
router.patch ('/:vehicleId/status', auth, validate(schemas.vehicleStatus), vehicleController.updateStatus);

module.exports = router;
