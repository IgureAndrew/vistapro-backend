// src/models/userModel.js
const { pool } = require("../config/database");
const { v4: uuidv4 } = require("uuid");

/**
 * createUser - Inserts a new user into the "users" table.
 * Expects in userData: 
 *   first_name, last_name, email, password, role, gender,
 *   bank_name, account_number, account_name, location
 * and (for Dealers) business_name, business_address.
 */
const createUser = async (userData) => {
  const {
    unique_id,
    first_name,
    last_name,
    email,
    password,
    role,
    gender,
    bank_name,
    account_number,
    account_name,
    location,
    business_name,
    business_address,
  } = userData;
  const finalUniqueId = unique_id || uuidv4();
  const query = `
    INSERT INTO users (
      unique_id,
      first_name,
      last_name,
      gender,
      email,
      password,
      bank_name,
      account_number,
      account_name,
      role,
      location,
      business_name,
      business_address,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
    RETURNING *
  `;
  const values = [
    finalUniqueId,
    first_name || null,
    last_name || null,
    gender || null,
    email || null,
    password,
    bank_name || null,
    account_number || null,
    account_name || null,
    role,
    location || null,
    business_name || null,
    business_address || null,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

module.exports = { createUser };
