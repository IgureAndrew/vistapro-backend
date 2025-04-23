// src/routes/stockRoutes.js
const express = require('express');
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole }  = require('../middlewares/roleMiddleware');
const {
  createStockUpdate,
  requestStockTransfer,
  approveStockTransfer,
  markStockAsSold,
  getMarketerStockUpdates,
  getStockUpdates,
  getStaleStockUpdates,
  getStockUpdateHistory
} = require('../controllers/stockupdateController');

const router = express.Router();

// pickup, list, mark‐sold…
router.post(   '/',           verifyToken, verifyRole(['Marketer']), createStockUpdate);
router.get(    '/marketer',   verifyToken, verifyRole(['Marketer']), getMarketerStockUpdates);
router.patch(  '/:id/sold',    verifyToken, verifyRole(['MasterAdmin']), markStockAsSold);
router.get(    '/',           verifyToken, getStockUpdates);
router.get(    '/stale',      verifyToken, getStaleStockUpdates);
router.get(    '/history',    verifyToken, getStockUpdateHistory);

// transfer flow:
router.post(   '/:id/transfer',          verifyToken, verifyRole(['Marketer']), requestStockTransfer);
router.patch(  '/:id/transfer',          verifyToken, verifyRole(['MasterAdmin']), approveStockTransfer);

module.exports = router;
