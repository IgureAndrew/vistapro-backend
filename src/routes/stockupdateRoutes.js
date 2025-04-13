// src/routes/stockRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const {
  createStockUpdate,
  markStockAsSold,
  getStockUpdates,
  getStaleStockUpdates,
  getStockUpdateHistory,
  getMarketerStockUpdates
} = require('../controllers/stockupdateController');

// Route: Create a new stock update (accessible by Marketers)
router.post('/', verifyToken, verifyRole(["Marketer"]), createStockUpdate);

// Route: Get all stock updates (accessible by authenticated users)
// The controller applies role-based filtering.
router.get('/', verifyToken, getStockUpdates);

// New Route: Get stock updates for a marketer (accessible only by Marketers)
router.get('/marketer', verifyToken, verifyRole(["Marketer"]), getMarketerStockUpdates);


// Route: Mark a stock update as sold (accessible only by Master Admin)
router.patch('/:id/sold', verifyToken, verifyRole(["MasterAdmin"]), markStockAsSold);

// Route: Get stale stock updates (accessible by authenticated users)
// The controller applies role-based filtering.
router.get('/stale', verifyToken, getStaleStockUpdates);

// Route: Get stock update history (aggregated by week, month, or year, filtered by role)
router.get('/history', verifyToken, getStockUpdateHistory);

module.exports = router;
