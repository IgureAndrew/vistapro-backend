// src/config/database.js
// This file sets up the PostgreSQL connection using the pg Pool.

const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Create a new PostgreSQL pool using the connection string from the environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Make sure DATABASE_URL is defined in your .env file
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
