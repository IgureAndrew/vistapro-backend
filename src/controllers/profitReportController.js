// profitReportController.js
import express from 'express';
import {
  getInventorySnapshot,
  getDailySales,
  getGoals
} from './profitReportService.js';
const { pool } = require('../config/database');
const router = express.Router();

// GET /reports/inventory-snapshot
router.get('/inventory-snapshot', async (req, res, next) => {
  try {
    const data = await getInventorySnapshot();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /reports/daily-sales
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

// GET /reports/goals
router.get('/goals', async (req, res, next) => {
  try {
    const data = await getGoals();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
