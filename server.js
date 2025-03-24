// server.js
// Entry point for the Vistapro backend server

const app = require('./src/app'); // Import Express app
const { connectDB } = require('./src/config/database'); // Import database connection function

// Define the port to run the server
const PORT = process.env.PORT || 5000;

// Connect to PostgreSQL and start the server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("Failed to connect to the database:", err);
    process.exit(1);
  });
