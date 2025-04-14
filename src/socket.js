// src/socket.js
const socketIo = require('socket.io');

let io;

const initSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: [
        "https://www.vistapro.ng",      // your production frontend
        "http://localhost:5173",       // your local dev (if needed)
      ],
      methods: ["GET", "POST", "OPTIONS"]
    }
  });

  io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

    socket.on("register", (uniqueId) => {
      socket.join(uniqueId);
      console.log(`Socket ${socket.id} registered to room ${uniqueId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

module.exports = { initSocket, getIo };
