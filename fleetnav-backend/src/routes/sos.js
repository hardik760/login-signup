'use strict';
const router         = require('express').Router();
const auth           = require('../middleware/auth');
const rateLimiters   = require('../middleware/rateLimiter');
const sosController  = require('../controllers/sosController');

router.post('/', auth, rateLimiters.sos, sosController.trigger);

module.exports = router;
