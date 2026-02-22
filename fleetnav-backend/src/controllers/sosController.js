'use strict';
const { SOS, User } = require('../models');
const asyncHandler  = require('../middleware/asyncHandler');

exports.trigger = asyncHandler(async (req, res) => {
  if (req.user.sosCredit <= 0) {
    return res.status(403).json({
      error: 'SOS is a one-time system. Your signal credit has been used.',
      code:  'SOS_CREDIT_EXHAUSTED',
    });
  }
  const { lat, lng, vehicleId } = req.body;
  const [sos] = await Promise.all([
    SOS.create({ userId: req.user._id, vehicleId, lat, lng }),
    User.findByIdAndUpdate(req.user._id, { $inc: { sosCredit: -1 } }),
  ]);
  const io = req.app.get('io');
  io.to('nearby-all').emit('sos-alert', {
    sosId:     sos._id,
    lat, lng, vehicleId,
    userName:  `${req.user.firstName} ${req.user.lastName}`,
    timestamp: new Date(),
  });
  res.json({
    message:  'SOS signal broadcast to nearby users',
    sosId:    sos._id,
    warning:  'This was your one-time SOS credit.',
  });
});
