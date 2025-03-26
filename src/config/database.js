// src/config/database.js
// This file sets up the PostgreSQL connection using the pg Pool.

const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables from .env file (for local development)
dotenv.config();

/**
 * Determine SSL settings:
 * - If NODE_ENV === 'production', we often need { rejectUnauthorized: false }
 *   for Render’s external database connection.
 * - Otherwise, we can disable SSL locally.
 */
const sslConfig =
  process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false;

// Create a new PostgreSQL pool using the connection string from the environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
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
