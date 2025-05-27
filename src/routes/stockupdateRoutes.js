// src/routes/stockupdateRoutes.js
const express          = require('express');
const router           = express.Router();
const { verifyToken }  = require('../middlewares/authMiddleware');
const { verifyRole }   = require('../middlewares/roleMiddleware');
const ctrl             = require('../controllers/stockupdateController');

/** MARKETER‐ONLY **/
// 1) List dealers in your state
router.get(
  '/pickup/dealers',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.listStockPickupDealers
);

// 2) List available products for a dealer
router.get(
  '/pickup/dealers/:dealerUniqueId/products',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.listStockProductsByDealer
);

// 3) Pick up stock (qty always 1 or up to allowance)
router.post(
  '/',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.createStockUpdate
);

// 4) Place an order from a pending pickup
router.post(
  '/order',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.placeOrder
);

// 5) Transfer a pending pickup to another marketer
router.post(
  '/:id/transfer',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.requestStockTransfer
);

// 6) Request return on a pending pickup
router.patch(
  '/:id/return-request',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.requestReturn
);

// 7) Ask for extra‐pickup allowance (up to 3)
router.post(
  '/pickup/request-additional',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.requestAdditionalPickup
);

// 8) Check your current pickup allowance (1 or 3)
router.get(
  '/pickup/allowance',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.getAllowance
);

// 9) List your own pickups
router.get(
  '/marketer',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.getMarketerStockUpdates
);


/** MASTER‐ADMIN‐ONLY **/
// 10) Confirm a return
router.patch(
  '/:id/return',
  verifyToken,
  verifyRole(['MasterAdmin']),
  ctrl.confirmReturn
);

// 11) List all pending extra‐pickup requests
router.get(
  '/pickup/requests',
  verifyToken,
  verifyRole(['MasterAdmin']),
  ctrl.listExtraPickupRequests
);

// 12) Approve or reject an extra‐pickup request
router.patch(
  '/pickup/requests/:id',
  verifyToken,
  verifyRole(['MasterAdmin']),
  ctrl.reviewExtraPickupRequest
);


/** ADMIN‐ONLY **/
// 13) Admin sees pickups under their marketers
router.get(
  '/admin/stock-pickup',
  verifyToken,
  verifyRole(['Admin']),
  ctrl.getStockUpdatesForAdmin
);


/** SUPER‐ADMIN‐ONLY **/
// 14) SuperAdmin sees all pickups in their hierarchy
router.get(
  '/superadmin/stock-updates',
  verifyToken,
  verifyRole(['SuperAdmin']),
  ctrl.listSuperAdminStockUpdates
);


/** ALL STAFF (MasterAdmin, Admin, SuperAdmin) **/
// 15) Global list of all pickups
router.get(
  '/',
  verifyToken,
  verifyRole(['MasterAdmin','Admin','SuperAdmin']),
  ctrl.getStockUpdates
);

module.exports = router;
