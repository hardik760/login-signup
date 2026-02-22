import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Loginsignup.css";

import user_icon from "../assets/person.png";
import email_icon from "../assets/email.png";
import password_icon from "../assets/password.png";

import { loginApi, registerApi } from "../services/auth";


const Loginsignup = () => {
  const [action, setAction] = useState("Login");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setError("");
  
    try {
      let res;
  
      if (action === "Login") {
        if (!email || !password) {
          setError("Email and password are required");
          return;
        }
  
        res = await loginApi(email, password);
      } 
      else {
        if (!name || !email || !password) {
          setError("All fields are required");
          return;
        }
  
        res = await registerApi(name, email, password);
      }
  
      // Save real JWT
      localStorage.setItem("token", res.token);
  
      navigate("/dashboard");
  
    } catch (err) {
      setError(err.message);
    }
  };
  

  return (

    <div className="container">
      <div className="header">
        <div className="text">{action}</div>
        <div className="underline"></div>
      </div>

      <div className="inputs">
        {action === "Sign Up" && (
          <div className="input">
            <img src={user_icon} alt="" />
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}

        <div className="input">
          <img src={email_icon} alt="" />
          <input
            type="email"
            placeholder="Email ID"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="input">
          <img src={password_icon} alt="" />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {action === "Login" && (
        <div className="forgot-password">
          Lost Password? <span>Click here</span>
        </div>
      )}

      <div className="submit-container">
        <div
          className={action === "Login" ? "submit gray" : "submit"}
          onClick={() => setAction("Sign Up")}
        >Sign Up</div>

        <div
          className={action === "Sign Up" ? "submit gray" : "submit"}
          onClick={() => {
            setAction("Login");
            handleSubmit();
          }}
        >Login</div>
        
      </div>
    </div>
  );
};

export default Loginsignup;

