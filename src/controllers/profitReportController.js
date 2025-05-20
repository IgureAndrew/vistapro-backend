import express from 'express';
import {
  getInventorySnapshot,
  getDailySales,
  getGoals,
  getInventoryDetails,
  getProductsSold,
  getAggregatedSales,
  getDailyTotals
} from '../services/profitReportService.js';

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
router.get('/aggregated', async (req, res, next) => {
  try {
    const { start, end, deviceType, deviceName } = req.query;
    const data = await getAggregatedSales({ start, end, deviceType, deviceName });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// NEW: GET /api/profit-report/daily-summary
// Returns grand totals for the specified date range
router.get('/daily-summary', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    // validate dates presence?
    const totals = await getDailyTotals({ start, end });
    res.json({ totals });
  } catch (err) {
    next(err);
  }
});

export default router;
