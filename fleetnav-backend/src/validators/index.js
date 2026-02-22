// ═══════════════════════════════════════════════════════
// validators/index.js
// Joi schema validation for all incoming request bodies
// ═══════════════════════════════════════════════════════
'use strict';

const Joi = require('joi');

// ── Auth ─────────────────────────────────────────────
const signup = Joi.object({
  firstName:       Joi.string().trim().min(2).max(50).required(),
  lastName:        Joi.string().trim().min(1).max(50).required(),
  email:           Joi.string().email().lowercase().required(),
  mobile:          Joi.string().pattern(/^\+?[0-9]{10,15}$/).required()
                      .messages({ 'string.pattern.base': 'Mobile must be a valid phone number' }),
  password:        Joi.string().min(8).max(128).required(),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required()
                      .messages({ 'any.only': 'Passwords do not match' }),
});

const signin = Joi.object({
  identifier: Joi.string().required()
                 .messages({ 'any.required': 'Email or mobile is required' }),
  password:   Joi.string().required(),
});

// ── Vehicle ───────────────────────────────────────────
const vehicleCreate = Joi.object({
  name:        Joi.string().trim().max(60).default('My Vehicle'),
  type:        Joi.string().valid('car','bike','bus','truck','auto','other').required(),
  plate:       Joi.string().uppercase().trim().min(4).max(15).required()
                  .messages({ 'any.required': 'Number plate is required' }),
  make:        Joi.string().trim().max(40).optional(),
  model:       Joi.string().trim().max(40).optional(),
  color:       Joi.string().trim().max(20).optional(),
  year:        Joi.number().integer().min(1990).max(new Date().getFullYear() + 1).optional(),
  isPublic:    Joi.boolean().default(false),
  destination: Joi.when('isPublic', { is: true, then: Joi.string().trim().max(100), otherwise: Joi.any().strip() }),
  fleetId:     Joi.string().optional(),
});

const vehicleStatus = Joi.object({
  status: Joi.string().valid('active','idle','offline','inactive').required(),
});

// ── Location ──────────────────────────────────────────
const locationPing = Joi.object({
  lat:      Joi.number().min(-90).max(90).required(),
  lng:      Joi.number().min(-180).max(180).required(),
  speed:    Joi.number().min(0).max(500).default(0),
  heading:  Joi.number().min(0).max(360).default(0),
  accuracy: Joi.number().min(0).default(0),
  altitude: Joi.number().default(0),
  timestamp:Joi.date().iso().default(() => new Date()),
});

const locationBatch = Joi.object({
  updates: Joi.array().items(
    Joi.object({
      vehicleId: Joi.string().required(),
      lat:       Joi.number().min(-90).max(90).required(),
      lng:       Joi.number().min(-180).max(180).required(),
      speed:     Joi.number().min(0).default(0),
      heading:   Joi.number().min(0).max(360).default(0),
      timestamp: Joi.date().iso().default(() => new Date()),
    })
  ).min(1).max(1000).required()
   .messages({ 'array.max': 'Max 1000 updates per batch' }),
});

// ── Reports ───────────────────────────────────────────
const report = Joi.object({
  type:     Joi.string().valid('accident','traffic','construction','pothole','harassment','flooding','other').required(),
  reason:   Joi.string().trim().min(5).max(500).required()
               .messages({ 'string.min': 'Please provide a meaningful reason (min 5 characters)' }),
  lat:      Joi.number().min(-90).max(90).required(),
  lng:      Joi.number().min(-180).max(180).required(),
  severity: Joi.string().valid('low','medium','high').default('medium'),
});

// ── SOS ───────────────────────────────────────────────
const sos = Joi.object({
  lat:       Joi.number().min(-90).max(90).optional(),
  lng:       Joi.number().min(-180).max(180).optional(),
  vehicleId: Joi.string().optional(),
});

// ── Middleware factory ────────────────────────────────
// Usage: router.post('/', validate(validators.signup), handler)
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,   // Return ALL errors, not just the first
      stripUnknown: true,  // Remove fields not in schema (security)
    });

    if (error) {
      const details = error.details.map(d => d.message);
      return res.status(400).json({ error: 'Validation failed', details });
    }

    req.body = value; // Replace body with validated + sanitized version
    next();
  };
}

module.exports = {
  schemas: { signup, signin, vehicleCreate, vehicleStatus, locationPing, locationBatch, report, sos },
  validate,
};
