// src/routes/stockupdateRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole }  = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/stockupdateController');

// 1. Marketer picks up stock
router.post(
  '/',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.createStockUpdate
);

// 2. Marketer places order (uses pending pickup or free-order)
router.post(
  '/order',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.placeOrder
);

// 3. Marketer requests to transfer a pending pickup
router.post(
  '/:id/transfer',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.requestStockTransfer
);

// 4. MasterAdmin approves/rejects transfers
router.patch(
  '/:id/transfer',
  verifyToken,
  verifyRole(['MasterAdmin']),
  ctrl.approveStockTransfer
);

// 5. List my pickups
router.get(
  '/marketer',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.getMarketerStockUpdates
);

// 6. List all pickups (Master/Admin/SuperAdmin)
router.get(
  '/',
  verifyToken,
  verifyRole(['MasterAdmin','Admin','SuperAdmin']),
  ctrl.getStockUpdates
);

module.exports = router;
