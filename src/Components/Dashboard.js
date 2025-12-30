import React, { useState, useEffect } from "react";
import "../App.css";
import { Dashboarddata } from "./Dashboarddata";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import { useNavigate } from "react-router-dom";

function Dashboard() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startLocation, setStartLocation] = useState("");
const [destination, setDestination] = useState("");
const [vehicleQuery, setVehicleQuery] = useState("");


  const navigate = useNavigate();


  useEffect(() => {

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => {},
        () => {}
      );
    }


    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        console.log("Notification permission:", permission);
      });
    }


    if ("vibrate" in navigator) {
      navigator.vibrate(100);
    }
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    console.log(searchQuery);
  };

  return (
    <div className="Dashboard">

      <div className="searchbar-container">
  <form onSubmit={handleSearch} className="search-form">
    <input
      type="text"
      placeholder="Choose start location"
      value={startLocation}
      onChange={(e) => setStartLocation(e.target.value)}
    />
       <button type="submit" className="search-button">
      Search
    </button>
  </form>

  <form onSubmit={handleSearch} className="search-form">
    <input
      type="text"
      placeholder="Choose destination"
      value={destination}
      onChange={(e) => setDestination(e.target.value)}
    />
       <button type="submit" className="search-button">
      Search
    </button>
  </form>

  <form onSubmit={handleSearch} className="search-form">
    <input
      type="text"
      placeholder="Search for vehicles"
      value={vehicleQuery}
      onChange={(e) => setVehicleQuery(e.target.value)}
    />
       <button type="submit" className="search-button">
      Search
    </button>
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
    </div>
  );
}

export default Dashboard;

