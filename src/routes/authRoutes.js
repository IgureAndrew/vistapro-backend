// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { loginUser, forgotPassword, resetPassword, getCurrentUser, } = require('../controllers/authController');
const { verifyToken } = require("../middlewares/authMiddleware");

// POST /api/auth/login with input validation
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('A valid email is required.'),
    // Password must be at least 10 characters, contain at least one letter and one number,
    // and can include special characters.
    body('password')
      .isLength({ min: 10 })
      .withMessage('Password must be at least 10 characters long.')
      .matches(/^(?=.*[A-Za-z])(?=.*\d).{10,}$/)
      .withMessage('Password must contain at least one letter and one number.')
  ],
  (req, res, next) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    // If validation passed, call the controller function
    loginUser(req, res, next);
  }
);

// Similarly, add validations for forgot-password and reset-password as needed
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get("/me", verifyToken, getCurrentUser);
module.exports = router;
