// src/models/userModel.js
const { pool } = require("../config/database");
const { v4: uuidv4 } = require("uuid");

/**
 * createUser - Inserts a new user into the "users" table.
 * Expects in userData: first_name, last_name, email, password, role, (gender, bank_id, custom_bank_name, account_number, account_name)
 * Ensure your "users" table has columns for first_name, last_name, email, password, role, gender, bank_id, custom_bank_name, account_number, account_name, created_at.
 */
const createUser = async (userData) => {
  const {
    first_name,
    last_name,
    email,
    password,
    role,
    gender,
    bank_id,
    custom_bank_name,
    account_number,
    account_name,
  } = userData;
  // Generate a unique ID
  const uniqueId = uuidv4();
  const query = `
    INSERT INTO users (
      unique_id, 
      first_name, 
      last_name, 
      email, 
      password, 
      role, 
      gender,
      bank_id,
      custom_bank_name,
      account_number,
      account_name,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    RETURNING *
  `;
  const values = [
    uniqueId,
    first_name,
    last_name,
    email,
    password,
    role,
    gender,
    bank_id,
    custom_bank_name,
    account_number,
    account_name,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

module.exports = { createUser };
