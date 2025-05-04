// src/socket.js
const { Server } = require('socket.io');

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: [
        'https://vistapro.ng',      // your production frontend (no www)
        'https://www.vistapro.ng',  // keep if you also host with www
        'http://localhost:5173'     // local dev
      ],
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    socket.on('register', (uniqueId) => {
      socket.join(uniqueId);
      console.log(`Socket ${socket.id} joined room ${uniqueId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIo() {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
}

module.exports = { initSocket, getIo };
