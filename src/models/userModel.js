// src/models/userModel.js
const { pool } = require("../config/database");
const { v4: uuidv4 } = require("uuid");

/**
 * createUser - Inserts a new user into the "users" table.
 * Expects in userData:
 *   first_name, last_name, email, password, role, phone, gender
 * Ensure your "users" table has these columns: unique_id, first_name, last_name, email, password, role, phone, gender, created_at.
 */
const createUser = async (userData) => {
  const {
    first_name,
    last_name,
    email,
    password,
    role,
    phone,
    gender
  } = userData;

  // Generate a unique ID (UUID)
  const uniqueId = uuidv4();

  // Insert into users table
  const query = `
    INSERT INTO users (
      unique_id,
      first_name,
      last_name,
      email,
      password,
      role,
      phone,
      gender,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING *
  `;
  const values = [
    uniqueId,
    first_name,
    last_name,
    email,
    password,
    role,
    phone,
    gender
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};

module.exports = { createUser };
