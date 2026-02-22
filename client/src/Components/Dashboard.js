import React, { useState, useEffect } from "react";
import "../App.css";
import { Dashboarddata } from "./Dashboarddata";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import { useNavigate } from "react-router-dom";

import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import DirectionsBusFilledIcon from "@mui/icons-material/DirectionsBusFilled";

function Dashboard() {
  const [open, setOpen] = useState(false);


  const [mode, setMode] = useState("private");


  const [startLocation, setStartLocation] = useState("");
  const [destination, setDestination] = useState("");
  const [vehicleQuery, setVehicleQuery] = useState("");

  const navigate = useNavigate();


  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {});
    }

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    if ("vibrate" in navigator) {
      navigator.vibrate(100);
    }
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    console.log({ startLocation, destination, vehicleQuery, mode });
  };

  return (
    <div className="Dashboard">


      <div className="searchbar-container">
        
        <form className="search-form" onSubmit={handleSearch}>
          <input
            placeholder="Choose start location"
            value={startLocation}
            onChange={(e) => setStartLocation(e.target.value)}
          />
          <button className="search-button">Search</button>
        </form>

        <form className="search-form" onSubmit={handleSearch}>
          <input
            placeholder="Choose destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
          <button className="search-button">Search</button>
        </form>

        <form className="search-form" onSubmit={handleSearch}>
          <input
            placeholder="Search for vehicles"
            value={vehicleQuery}
            onChange={(e) => setVehicleQuery(e.target.value)}
          />
          <button className="search-button">Search</button>
        </form>
      </div>


      <div className="menu-icon" onClick={() => setOpen(!open)}>
        <MenuOutlinedIcon />
      </div>

      {open && (
        <ul className="Dashboarddata">
          {Dashboarddata.map((val, key) => (
            <li
              key={key}
              className="row"
              onClick={() => {
                navigate(val.link);
                setOpen(false);
              }}
            >
              <div className="icon">{val.icon}</div>
              <div className="title">{val.title}</div>
            </li>
          ))}
        </ul>
      )}


      <div className="transport-bar">
        <button
          className={`transport-btn ${mode === "public" ? "active" : ""}`}
          onClick={() => setMode("public")}
        >
          <DirectionsBusFilledIcon />
          <span>Public</span>
        </button>

        <button
          className={`transport-btn ${mode === "private" ? "active" : ""}`}
          onClick={() => setMode("private")}
        >
          <DirectionsCarIcon />
          <span>Private</span>
        </button>

        <button
          className={`transport-btn ${mode === "walking" ? "active" : ""}`}
          onClick={() => setMode("walking")}
        >
          <DirectionsRunIcon />
          <span>Walking</span>
        </button>
      </div>

    </div>
  );
}

export default Dashboard;

