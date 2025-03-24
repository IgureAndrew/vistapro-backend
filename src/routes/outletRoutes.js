// src/routes/outletRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const {
  initiateOrderToDealers,
  acceptOrderFromMarketers,
  acceptReturnOrderFromMarketers,
  updateDealerStockPickup
} = require('../controllers/outletController');

// Protected route: Initiate order to dealers
router.post('/initiate-order', verifyToken, initiateOrderToDealers);

// Protected route: Accept order from marketers
router.post('/accept-order', verifyToken, acceptOrderFromMarketers);

// Protected route: Accept return order from marketers
router.post('/accept-return-order', verifyToken, acceptReturnOrderFromMarketers);

// Protected route: Update dealer stock pickup information
router.post('/update-dealer-stock-pickup', verifyToken, updateDealerStockPickup);

module.exports = router;
