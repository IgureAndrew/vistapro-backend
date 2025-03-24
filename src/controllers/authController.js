// src/controllers/authController.js
// Controller functions for user authentication (login, forgot password, reset password)

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
    
    // Generate JWT token (adjust secret and expiry as needed)
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    
    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
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

// Export the functions directly
module.exports = { loginUser, forgotPassword, resetPassword };
