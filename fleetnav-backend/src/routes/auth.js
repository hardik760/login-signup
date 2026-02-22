// ═══════════════════════════════════════════════════════
// routes/auth.js
// ═══════════════════════════════════════════════════════
'use strict';

const router         = require('express').Router();
const authController = require('../controllers/authController');
const auth           = require('../middleware/auth');
const { validate, schemas } = require('../validators');

router.post('/signup',  validate(schemas.signup), authController.signup);
router.post('/signin',  validate(schemas.signin), authController.signin);
router.post('/refresh', authController.refreshToken);
router.post('/logout',  auth, authController.logout);
router.get ('/me',      auth, authController.getMe);

module.exports = router;
