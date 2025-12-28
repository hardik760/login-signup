import React, { useState } from "react";
import "../App.css";
import { Dashboarddata } from "./Dashboarddata";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import { useNavigate } from "react-router-dom";

function Dashboard() {
  const [open, setOpen] = useState(false);
  const [searchQuery,setsearchQuery]=useState("");

  const navigate = useNavigate();

  const handleSearch=(e) =>{


  }

  return (
    <div className="Dashboard">

<div className="searchbar">


<form onSubmit={handleSearch} className="search-form"> 
    <input   
     type="text"
    placeholder="Chooose start location"
    className=" "
    value={searchQuery}
    onChange={(e)=>setsearchQuery(e.target.value)}
    />
 <button type="submit" className="search-button">Search</button>

</form>

<form onSubmit={handleSearch} className="search-form"> 
    <input   
     type="text"
    placeholder="Choose destination"
    className=" "
    value={searchQuery}
    onChange={(e)=>setsearchQuery(e.target.value)}
    />
 <button type="submit" className="search-button">Search</button>

</form>

<form onSubmit={handleSearch} className="search-form"> 
    <input   
     type="text"
    placeholder="Search for vehicles"
    className=" "
    value={searchQuery}
    onChange={(e)=>setsearchQuery(e.target.value)}
    />
 <button type="submit" className="search-button">Search</button>

</form>

</div>

      <div className="menu-icon" onClick={() => setOpen(!open)}>
        <MenuOutlinedIcon  />
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

  