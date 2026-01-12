const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  addVehicle,
  getMyVehicles,
  deleteVehicle
} = require("../controllers/vehicleController");

router.post("/", authMiddleware, addVehicle);
router.get("/", authMiddleware, getMyVehicles);
router.delete("/:id", authMiddleware, deleteVehicle);

module.exports = router;
