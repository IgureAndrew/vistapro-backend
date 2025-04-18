// server.js
const app = require('./src/app'); // Your Express app
const { connectDB } = require('./src/config/database');
const http = require('http');
const { initSocket } = require('./src/socket');

// Create an HTTP server from your Express app.
const server = http.createServer(app);

// Initialize Socket.IO using your custom function.
const io = initSocket(server);

// Optional: Add additional event listeners if needed.
// For example, handling a "send-message" event and broadcasting it.
io.on("connection", (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  socket.on("send-message", (messageData) => {
    io.emit("receive-message", messageData);
  });
  
  // If needed, add more custom event listeners here.
  
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Make the Socket.IO instance available throughout your Express app.
app.set("socketio", io);

// ❷ On socket connect, have each marketer join their room
io.on("connection", socket => {
  const { userUniqueId } = socket.handshake.query;
  if (userUniqueId) {
    socket.join(`marketer:${userUniqueId}`);
  }
});

const PORT = process.env.PORT || 5000;

// Connect to the database and then start the HTTP server.
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("Failed to connect to the database:", err);
    process.exit(1);
  });
