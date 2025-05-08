// src/routes/stockupdateRoutes.js
const express = require('express');
const router  = express.Router();
const { verifyToken }   = require('../middlewares/authMiddleware');
const { verifyRole }    = require('../middlewares/roleMiddleware');
const ctrl              = require('../controllers/stockupdateController');

// 1) List dealers in marketer’s state for stock pickup
router.get(
  '/pickup/dealers',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.listStockPickupDealers
);

// 2) List available products for a dealer (same state only)
router.get(
  '/pickup/dealers/:dealerUniqueId/products',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.listStockProductsByDealer
);

// 3) Marketer picks up stock
router.post(
  '/',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.createStockUpdate
);

// 4) Marketer places order (uses pending pickup or free-order)
router.post(
  '/order',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.placeOrder
);

// 5) Marketer requests to transfer a pending pickup
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
    ctrl.reviewStockTransfer    // <— new unified handler
  );

// 7) List my pickups
router.get(
  '/marketer',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.getMarketerStockUpdates
);

// 8) List all pickups (Master/Admin/SuperAdmin)
router.get(
  '/',
  verifyToken,
  verifyRole(['MasterAdmin','Admin','SuperAdmin']),
  ctrl.getStockUpdates
);

// 9) MasterAdmin confirms a return on a pickup
router.patch(
  '/:id/return',
  verifyToken,
  verifyRole(['MasterAdmin']),
  ctrl.confirmReturn
);

router.get(
  '/superadmin/stock-updates',
  verifyToken,
  verifyRole(['SuperAdmin']),
  ctrl.listSuperAdminStockUpdates
);
module.exports = router;
