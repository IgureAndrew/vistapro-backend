// src/routes/stockupdateRoutes.js

const express       = require('express');
const router        = express.Router();
const { verifyToken }   = require('../middlewares/authMiddleware');
const { verifyRole }    = require('../middlewares/roleMiddleware');
const ctrl             = require('../controllers/stockupdateController');

/**
 * MARKETER-ONLY
 */
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

// 3) Marketer picks up stock (always qty=1, up to max_pickups)
router.post(
  '/',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.createStockUpdate
);

// 4) Marketer places order from a pending pickup (records the IMEIs)
router.post(
  '/order',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.placeOrder
);

// 5) Marketer requests a transfer of a pending pickup
router.post(
  '/:id/transfer',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.requestStockTransfer
);

// 6) Marketer requests a return on a pending pickup
router.patch(
  '/:id/return-request',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.requestReturn
);

// 7) Request up to 3 additional pickups (once no active pickup exists)
router.post(
  '/pickup/request-additional',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.requestAdditionalPickup
);

// 8) Fetch unread notifications (e.g. approval/rejection of requests)
router.get(
  '/notifications',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.getNotifications
);

// 9) Mark a notification as read
router.patch(
  '/notifications/:id/read',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.markNotificationRead
);

// 10) List this marketer’s own pickups
router.get(
  '/marketer',
  verifyToken,
  verifyRole(['Marketer']),
  ctrl.getMarketerStockUpdates
);

/**
 * MASTER-ADMIN-ONLY
 */
// 11) MasterAdmin confirms a return on a pickup
router.patch(
  '/:id/return',
  verifyToken,
  verifyRole(['MasterAdmin']),
  ctrl.confirmReturn
);

// 12) MasterAdmin approves or rejects an “additional pickup” request
router.patch(
  '/pickup/request-additional/:id/decision',
  verifyToken,
  verifyRole(['MasterAdmin']),
  ctrl.decideAdditionalPickup
);

/**
 * ADMIN-ONLY
 */
// 13) Admin sees pickups for their own marketers
router.get(
  '/admin/stock-pickup',
  verifyToken,
  verifyRole(['Admin']),
  ctrl.getStockUpdatesForAdmin
);

/**
 * SUPER-ADMIN-ONLY
 */
// 14) SuperAdmin sees all pickups under their hierarchy
router.get(
  '/superadmin/stock-updates',
  verifyToken,
  verifyRole(['SuperAdmin']),
  ctrl.listSuperAdminStockUpdates
);

/**
 * ALL STAFF (MasterAdmin | Admin | SuperAdmin)
 */
// 15) List all pickups (global view, human-friendly statuses)
router.get(
  '/',
  verifyToken,
  verifyRole(['MasterAdmin','Admin','SuperAdmin']),
  ctrl.getStockUpdates
);

module.exports = router;
