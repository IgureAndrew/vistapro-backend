// src/utils/logger.js
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console(),
    // Uncomment the line below to log to a file:
    // new transports.File({ filename: 'error.log', level: 'error' })
  ],
});

module.exports = logger;
