const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const vehicleRoutes = require("./src/routes/vehicleRoutes");
const userRoutes = require("./src/routes/userRoutes");
require("dotenv").config();



const connectDB = require("./src/config/db");
const authRoutes = require("./src/routes/authRoutes");

const app = express();
const server = http.createServer(app);

// MIDDLEWARES
app.use(cors());
app.use(express.json());


// DATABASE
connectDB();

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/vehicles", vehicleRoutes);

// SOCKET.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("send-location", (data) => {
    socket.broadcast.emit("receive-location", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// START SERVER
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
