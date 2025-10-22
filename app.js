const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let drivers = {};
let riders = {};

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // 🚗 Driver shares location
  socket.on("driverLocation", (data) => {
    drivers[socket.id] = { ...data, id: socket.id, bookedBy: drivers[socket.id]?.bookedBy || null };
    io.emit("updateDrivers", drivers);
  });

  // 🚖 Rider shares location
  socket.on("riderLocation", (pos) => {
    riders[socket.id] = { ...pos, id: socket.id };

    // If this rider has booked a driver, update that driver
    const driverId = Object.keys(drivers).find((d) => drivers[d].bookedBy === socket.id);
    if (driverId && drivers[driverId]) {
      io.to(driverId).emit("riderPositionUpdate", {
        riderId: socket.id,
        lat: pos.lat,
        lng: pos.lng,
      });
    }
  });

  // 🧭 Rider books a driver
  socket.on("bookDriver", (driverId) => {
    const driver = drivers[driverId];
    const rider = riders[socket.id];

    if (!driver) {
      socket.emit("bookingFailed", "Driver not found.");
      return;
    }
    if (driver.bookedBy) {
      socket.emit("bookingFailed", "Driver already booked.");
      return;
    }
    if (!rider) {
      socket.emit("bookingFailed", "Rider location missing.");
      return;
    }

    // Mark driver as booked
    drivers[driverId].bookedBy = socket.id;

    // Notify both sides
    socket.emit("bookingSuccess", { driverId });
    io.to(driverId).emit("bookingConfirmed", {
      riderId: socket.id,
      lat: rider.lat,
      lng: rider.lng,
    });

    io.emit("updateDrivers", drivers);
  });

  // ❌ Disconnect cleanup
  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);

    if (drivers[socket.id]) delete drivers[socket.id];
    if (riders[socket.id]) delete riders[socket.id];

    // Free any drivers that were booked by this rider
    for (let id in drivers) {
      if (drivers[id].bookedBy === socket.id) drivers[id].bookedBy = null;
    }

    io.emit("updateDrivers", drivers);
  });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`🚀 Server running on https://localhost:${PORT}`));
