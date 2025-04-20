// src/controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

/**
 * loginUser - Handles user login.
 */
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Query the user by email
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    
    const user = result.rows[0];
    
    // Compare the provided password with the hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    
    // Generate JWT token including unique_id, with expiration set to 30 minutes
    const token = jwt.sign(
      { id: user.id, unique_id: user.unique_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    
    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        unique_id: user.unique_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        overall_verification_status: user.overall_verification_status,
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * forgotPassword - Sends a reset password link (placeholder).
 */
const forgotPassword = async (req, res, next) => {
  try {
    res.status(200).json({ message: 'Forgot password endpoint placeholder.' });
  } catch (error) {
    next(error);
  }
};

/**
 * resetPassword - Resets the password (placeholder).
 */
const resetPassword = async (req, res, next) => {
  try {
    res.status(200).json({ message: 'Reset password endpoint placeholder.' });
  } catch (error) {
    next(error);
  }
};

/**
 * getCurrentUser - Returns the logged‑in user’s profile & verification flags.
 */
const getCurrentUser = async (req, res, next) => {
  try {
    const { unique_id } = req.user;  // set by your verifyToken middleware
    const query = `
      SELECT
        id,
        unique_id,
        first_name,
        last_name,
        email,
        role,
        bio_submitted,
        guarantor_submitted,
        commitment_submitted,
        overall_verification_status
      FROM users
      WHERE unique_id = $1
    `;
    const { rows } = await pool.query(query, [unique_id]);
    if (!rows.length) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
};


module.exports = { loginUser, forgotPassword, resetPassword, getCurrentUser, };
