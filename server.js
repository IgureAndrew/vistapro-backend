// server.js
const app = require('./src/app'); // Your Express app
const { connectDB } = require('./src/config/database');
const http = require('http');
const { initSocket } = require('./src/socket');

// Create an HTTP server from your Express app
const server = http.createServer(app);

// Initialize Socket.IO with the HTTP server using your custom function.
const io = initSocket(server); // This should initialize and return the Socket.IO instance.

// (Optional) Set up socket event listeners here if not already set inside initSocket.
io.on("connection", (socket) => {
  console.log("A user connected: " + socket.id);
  socket.on("send-message", (messageData) => {
    io.emit("receive-message", messageData);
  });
  socket.on("disconnect", () => {
    console.log("User disconnected: " + socket.id);
  });
});

// Export a helper function if needed (or use the one from src/socket.js directly)
// Example:
// module.exports = { sendNotification };

const PORT = process.env.PORT || 5000;

// Connect to the database and then start the server
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
