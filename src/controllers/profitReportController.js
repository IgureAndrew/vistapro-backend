// backend/src/routes/profitReportController.js
import express from 'express';
import {
  getInventorySnapshot,
  getDailySales,
  getGoals,
  getInventoryDetails,
  getProductsSold,
   getAggregatedSales
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

// NEW: GET /api/profit-report/aggregated
// Query params: start=YYYY-MM-DD, end=YYYY-MM-DD, deviceType, deviceName
router.get('/aggregated', async (req, res, next) => {
  const { start, end, deviceType, deviceName } = req.query;
  try {
    const data = await getAggregatedSales({ start, end, deviceType, deviceName });
    res.json(data);
  } catch (err) {
    next(err);
  }
});
export default router;
