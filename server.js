// server.js
require('dotenv').config();
const http        = require('http');
const app         = require('./src/app');             // your Express app with CORS, sessions, Redis, etc.
const { connectDB } = require('./src/config/database');
const { initSocket } = require('./src/socket');       // should return a configured io instance

const PORT = process.env.PORT || 5000;

// Create HTTP server from Express
const server = http.createServer(app);

// Initialize Socket.IO (with CORS already handled in initSocket)
const io = initSocket(server);

// Make io available in your routes/controllers if needed
app.set('socketio', io);

// Main connection handler
io.on('connection', socket => {
  console.log(`New client connected: ${socket.id}`);

  // ❶ Join the marketer’s personal room (if supplied via query string)
  const { userUniqueId } = socket.handshake.query;
  if (userUniqueId) {
    const room = `marketer:${userUniqueId}`;
    socket.join(room);
    console.log(`Socket ${socket.id} joined room ${room}`);
  }

  // ❷ Example chat/event flow
  socket.on('send-message', messageData => {
    // broadcast to all or you can emit back to specific rooms...
    io.emit('receive-message', messageData);
  });

  // ❸ Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Connect to the database, then start listening
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to connect to the database:', err);
    process.exit(1);
  });
