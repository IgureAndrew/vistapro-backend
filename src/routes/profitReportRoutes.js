// backend/src/routes/profitReportRoutes.js
const express = require('express');
const {
  getInventorySnapshot,
  getDailySales,
  getGoals
} = require('../services/profitReportService');
const { verifyToken }   = require('../middlewares/authMiddleware');
const { verifyRole }    = require('../middlewares/roleMiddleware');

const router = express.Router();

// GET /api/profit-report/inventory-snapshot
router.get('/inventory-snapshot', async (req, res, next) => {
  try {
    const data = await getInventorySnapshot();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/profit-report/daily-sales
// Query params: start=YYYY-MM-DD, end=YYYY-MM-DD, deviceType, deviceName
router.get('/daily-sales', async (req, res, next) => {
  try {
    const { start, end, deviceType, deviceName } = req.query;
    const data = await getDailySales({ start, end, deviceType, deviceName });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/profit-report/goals
router.get('/goals', async (req, res, next) => {
  try {
    const data = await getGoals();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/profit-report/inventory-details
router.get('/inventory-details', async (req, res, next) => {
  try {
    const data = await getInventoryDetails();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
