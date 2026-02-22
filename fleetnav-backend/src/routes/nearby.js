// ═══════════════════════════════════════════════════════
// routes/nearby.js
// ═══════════════════════════════════════════════════════
'use strict';
const router = require('express').Router();
const locationController = require('../controllers/locationController');
const auth = require('../middleware/auth');
router.get('/', auth, locationController.getNearby);
module.exports = router;

