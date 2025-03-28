// src/config/database.js
const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Create a new PostgreSQL pool using the connection string from the environment.
// Add the SSL configuration to use SSL and disable certificate verification.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // e.g., Render connection string
  ssl: {
    rejectUnauthorized: false,
  },
});

/**
 * connectDB - Connects to the PostgreSQL database.
 * @returns {Promise} Resolves if the connection is successful, otherwise throws an error.
 */
const connectDB = async () => {
  try {
    // Test the connection by acquiring a client from the pool
    await pool.connect();
    console.log("Connected to PostgreSQL database");
  } catch (err) {
    console.error("Database connection error:", err);
    throw err;
  }
};

module.exports = { pool, connectDB };
