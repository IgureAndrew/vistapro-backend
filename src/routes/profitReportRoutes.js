// backend/src/routes/profitReportRoutes.js
const express = require('express');
const {
  getInventorySnapshot,
  getDailySales,
  getGoals,
  getInventoryDetails   // ← add this
} = require('../services/profitReportService');
const { verifyToken }   = require('../middlewares/authMiddleware');
const { verifyRole }    = require('../middlewares/roleMiddleware');

const router = express.Router();

// (Your existing routes...)

router.get('/inventory-details', async (req, res, next) => {
  try {
    const data = await getInventoryDetails();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
