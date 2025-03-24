// src/middlewares/errorHandler.js
const logger = require('../utils/logger'); // Make sure you have configured Winston in utils/logger.js

/**
 * Centralized error handling middleware.
 */
module.exports = (err, req, res, next) => {
  // Log the error stack using Winston
  logger.error(err.stack);

  // Optionally, set an HTTP status code if not already set
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || 'Internal Server Error',
    // In production, you might want to avoid sending the full error details
    error: process.env.NODE_ENV === 'production' ? {} : err
  });
};
