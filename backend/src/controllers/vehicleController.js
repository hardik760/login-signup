const Vehicle = require("../models/Vehicle");
const User = require("../models/User");

// ADD VEHICLE
exports.addVehicle = async (req, res) => {
  try {
    const { vehicleType, category, numberPlate } = req.body;

    const vehicle = await Vehicle.create({
      owner: req.user._id,
      vehicleType,
      category,
      numberPlate
    });

    req.user.vehicles.push(vehicle._id);
    await req.user.save();

    res.status(201).json(vehicle);
  } catch (err) {
    res.status(500).json({ message: "Vehicle creation failed" });
  }
};

// GET USER VEHICLES
exports.getMyVehicles = async (req, res) => {
  const vehicles = await Vehicle.find({ owner: req.user._id });
  res.json(vehicles);
};

// DELETE VEHICLE
exports.deleteVehicle = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).json({ message: "Vehicle not found" });
  }

  if (vehicle.owner.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Not allowed" });
  }

  await vehicle.deleteOne();

  res.json({ message: "Vehicle deleted" });
};
