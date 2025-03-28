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
} = require('../controllers/stockupdateController');

// Route: Create a new stock update (accessible by Marketers)
router.post('/', verifyToken, verifyRole(["Marketer"]), createStockUpdate);

// Route: Get all stock updates (accessible by authenticated users)
router.get('/', verifyToken, getStockUpdates);

// Route: Mark a stock update as sold (accessible by Marketers)
router.patch('/:id/sold', verifyToken, verifyRole(["Marketer"]), markStockAsSold);

// Route: Get stale stock updates (accessible by authenticated users)
router.get('/stale', verifyToken, getStaleStockUpdates);

module.exports = router;
