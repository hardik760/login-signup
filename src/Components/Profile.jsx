import React, { useState, useEffect } from "react";
import "./Profile.css";

const Profile = () => {
  const [vehicles, setVehicles] = useState([]);
  const [carName, setCarName] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState("private");
  const [vehicleType, setVehicleType] = useState("car");


  useEffect(() => {
    const savedVehicles = JSON.parse(localStorage.getItem("vehicles")) || [];
    setVehicles(savedVehicles);
  }, []);


  const handleAddVehicle = () => {
    if (!carName || !plateNumber) {
      alert("Please fill all fields");
      return;
    }

    const newVehicle = {
      id: Date.now(),
      carName,
      plateNumber,
      category: vehicleCategory,
      type: vehicleType,
    };

    const updatedVehicles = [...vehicles, newVehicle];
    setVehicles(updatedVehicles);
    localStorage.setItem("vehicles", JSON.stringify(updatedVehicles));

    setCarName("");
    setPlateNumber("");
  };


  const handleRemoveVehicle = (id) => {
    const updatedVehicles = vehicles.filter((v) => v.id !== id);
    setVehicles(updatedVehicles);
    localStorage.setItem("vehicles", JSON.stringify(updatedVehicles));
  };

  return (
    <div className="profile-container">
      <h2>Profile</h2>

      <div className="card">
        <h3>Register Vehicle</h3>

        <select
          value={vehicleCategory}
          onChange={(e) => setVehicleCategory(e.target.value)}
        >
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>

        <select
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
        >
          <option value="car">Car</option>
          <option value="bus">Bus</option>
          <option value="truck">Truck</option>
        </select>

        <input
          type="text"
          placeholder="Vehicle Name"
          value={carName}
          onChange={(e) => setCarName(e.target.value)}
        />

        <input
          type="text"
          placeholder="Number Plate"
          value={plateNumber}
          onChange={(e) => setPlateNumber(e.target.value)}
        />

        <button onClick={handleAddVehicle}>Add Vehicle</button>
      </div>

      <div className="card">


        <h3>My Vehicles</h3>

        {vehicles.length === 0 ? (
          <p>No vehicles registered</p>
        ) : (
          <ul className="vehicle-list">
            {vehicles.map((v) => (
              <li key={v.id}>
                <span>
                  <b>{v.carName}</b> ({v.category} – {v.type}) — {v.plateNumber}
                </span>
                <button onClick={() => handleRemoveVehicle(v.id)}>
                  ❌ Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        
      </div>


    </div>
  );
};

export default Profile;
