// server.js
const app = require('./src/app'); // Your Express app
const { connectDB } = require('./src/config/database'); // Database connection function
const http = require('http');
const { Server } = require("socket.io");
const { initSocket } = require('./src/socket');

// Create an HTTP server from your Express app
const server = http.createServer(app);


// Initialize Socket.IO with the HTTP server
initSocket(server);

// Initialize Socket.IO on the same server with CORS configuration
const io = new Server(server, {
  cors: { origin: "https://www.vistapro.ng/" } // Adjust origin as needed for production
});

// Listen for client connections and handle events via Socket.IO
io.on("connection", (socket) => {
  console.log("A user connected: " + socket.id);

  // Listen for a 'send-message' event from clients
  socket.on("send-message", (messageData) => {
    // For instance, messageData could be { to: recipientId, from: senderId, content: "Hello!" }
    // For simplicity, broadcast to all connected clients:
    io.emit("receive-message", messageData);
  });
  
  socket.on("disconnect", () => {
    console.log("User disconnected: " + socket.id);
  });
});

// Helper function to emit notifications to all connected clients
function sendNotification(notification) {
  io.emit("notification", notification);
}

// Export the sendNotification function if needed elsewhere in your app
module.exports = { sendNotification };

// Define the port
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
