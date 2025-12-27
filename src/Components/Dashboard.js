import React, { useState } from "react";
import "../App.css";
import { Dashboarddata } from "./Dashboarddata";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import { useNavigate } from "react-router-dom";

function Dashboard() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="Dashboard">


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

  