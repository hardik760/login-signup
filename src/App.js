import logo from './logo.svg';
import './App.css';
import Loginsignup from './Components/Loginsignup';
import Dashboard from "./Components/Dashboard";

import Profile from "./Components/Profile";

import { Routes, Route } from "react-router-dom";


function App() {
  return (
    <Routes>
    <Route path="/" element={<Loginsignup />} />
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/profile" element={<Profile />} />
  </Routes>

  );
}

export default App;


