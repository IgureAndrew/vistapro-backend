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
      { expiresIn: '30m' }
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

module.exports = { loginUser, forgotPassword, resetPassword };
