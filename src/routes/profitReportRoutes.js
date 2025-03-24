// src/routes/profitReportRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');

const {
  dailyProfitReport,
  weeklyProfitReport,
  monthlyProfitReport
} = require('../controllers/profitReportController');

// Protected route: Daily profit report
router.get('/daily', verifyToken, dailyProfitReport);

// Protected route: Weekly profit report
router.get('/weekly', verifyToken, weeklyProfitReport);

// Protected route: Monthly profit report
router.get('/monthly', verifyToken, monthlyProfitReport);

module.exports = router;
