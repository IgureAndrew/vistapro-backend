// src/socket.js
const socketIo = require('socket.io');

let io;

const initSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: "*", // Adjust this in production
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // Listen for a "register" event where the client provides their unique ID.
    socket.on("register", (uniqueId) => {
      // Join a room named by the uniqueId.
      socket.join(uniqueId);
      console.log(`Socket ${socket.id} registered to room ${uniqueId}`);
    });

    // Add additional event listeners here as needed.

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
