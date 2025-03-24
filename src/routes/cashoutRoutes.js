// src/routes/cashoutRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const {
  processWeeklyCashout,
  processMonthlyCashout,
  toggleCashout
} = require('../controllers/cashoutController');

// Protected route: Process weekly cashout
router.post('/weekly', verifyToken, processWeeklyCashout);

// Protected route: Process monthly cashout
router.post('/monthly', verifyToken, processMonthlyCashout);

// Protected route: Enable/Disable cashout (for weekly or monthly)
router.patch('/toggle', verifyToken, toggleCashout);

module.exports = router;
