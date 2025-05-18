// backend/src/routes/profitReportRoutes.js

const express = require('express');
const {
  getInventorySnapshot,
  getDailySales,
  getGoals,
  getInventoryDetails,
  getProductsSold,
  getAggregatedSales      // ← make sure your service exports this
} = require('../services/profitReportService');
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole }  = require('../middlewares/roleMiddleware'); // optional

const router = express.Router();

// apply auth to *all* profit‐report endpoints
router.use(verifyToken);

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

// GET /api/profit-report/products-sold
router.get('/products-sold', async (req, res, next) => {
  try {
    const { start, end, deviceType, deviceName } = req.query;
    const data = await getProductsSold({ start, end, deviceType, deviceName });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/profit-report/aggregated
// returns per‐day totals: units, revenue, commissions by tier, expenses, net profit
router.get('/aggregated', async (req, res, next) => {
  try {
    const { start, end, deviceType, deviceName } = req.query;
    const data = await getAggregatedSales({ start, end, deviceType, deviceName });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
