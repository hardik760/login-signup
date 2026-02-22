// ═══════════════════════════════════════════════════════
// routes/reports.js
// ═══════════════════════════════════════════════════════
'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/reportController');
const auth   = require('../middleware/auth');
const { validate, schemas } = require('../validators');

router.post('/',           auth, validate(schemas.report), ctrl.create);
router.get ('/nearby',     auth, ctrl.getNearby);
router.post('/:id/upvote', auth, ctrl.upvote);

module.exports = router;
