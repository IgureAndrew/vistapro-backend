// src/socket.js
const socketIo = require('socket.io');

let io;

const initSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? process.env.SOCKET_ORIGIN   // Your production frontend URL, e.g., "https://your-frontend-domain.com"
        : "*",
      methods: ["GET", "POST"]
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
