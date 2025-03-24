// src/models/userModel.js
const { pool } = require("../config/database");
const { v4: uuidv4 } = require("uuid");

/**
 * createUser - Inserts a new user into the "users" table.
 * This version inserts: unique_id, name, email, password, role, phone, gender, created_at.
 * Ensure that your database schema includes the "unique_id" column.
 */
const createUser = async (userData) => {
  const { name, email, password, role, phone, gender } = userData;
  // Generate a unique ID
  const uniqueId = uuidv4();
  const query = `
    INSERT INTO users (unique_id, name, email, password, role, phone, gender, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING *
  `;
  const values = [uniqueId, name, email, password, role, phone, gender];
  const result = await pool.query(query, values);
  return result.rows[0];
};

module.exports = { createUser };
