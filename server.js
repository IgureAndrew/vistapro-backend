// server.js
const app = require('./src/app'); // Your Express app
const { connectDB } = require('./src/config/database');
const http = require('http');
const { initSocket } = require('./src/socket');

// Create an HTTP server from your Express app.
const server = http.createServer(app);

// Initialize Socket.IO using your custom function.
const io = initSocket(server);

// Optionally, you can add extra event listeners here if needed,
// but avoid duplicating events already handled in socket.js.
// For example, if "send-message" is a unique event:
io.on("connection", (socket) => {
  socket.on("send-message", (messageData) => {
    io.emit("receive-message", messageData);
  });
});

// Make the Socket.IO instance available in your Express app.
app.set("socketio", io);



const PORT = process.env.PORT || 5000;

// Connect to the database and then start the server.
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
