// src/routes/manageOrderRoutes.js
const express = require('express');
const router  = express.Router();
const { verifyToken }    = require('../middlewares/authMiddleware');
const { verifyRole }     = require('../middlewares/roleMiddleware');
const mCtrl              = require('../controllers/manageOrderController');

// Only these roles may manage marketer orders:
const ADMIN_ROLES = ['MasterAdmin', 'SuperAdmin', 'Admin'];

// ─── 1) List PENDING marketer orders ────────────────────────────────────────
// GET  /api/manage-orders/orders
router.get(
  '/orders',
  verifyToken,
  verifyRole(ADMIN_ROLES),
  mCtrl.getOrders
);

// ─── 2) Confirm a pending order ─────────────────────────────────────────────
// PATCH /api/manage-orders/orders/:orderId/confirm
router.patch(
  '/orders/:orderId/confirm',
  verifyToken,
  verifyRole(ADMIN_ROLES),
  mCtrl.confirmOrder
);

// ─── 3) Confirm order to dealer ────────────────────────────────────────────
// PATCH /api/manage-orders/orders/:orderId/confirm-to-dealer
router.patch(
  '/orders/:orderId/confirm-to-dealer',
  verifyToken,
  verifyRole(ADMIN_ROLES),
  mCtrl.confirmOrderToDealer
);

// ─── 4) Full order history (all statuses) ──────────────────────────────────
// GET /api/manage-orders/orders/history
router.get(
  '/orders/history',
  verifyToken,
  verifyRole(ADMIN_ROLES),
  mCtrl.getOrderHistory
);

// ─── 5) Update an order’s fields (MasterAdmin only) ────────────────────────
// PUT /api/manage-orders/orders/:orderId
router.put(
  '/orders/:orderId',
  verifyToken,
  verifyRole(['MasterAdmin']),
  mCtrl.updateOrder
);

// ─── 6) Delete an order (MasterAdmin only) ─────────────────────────────────
// DELETE /api/manage-orders/orders/:orderId
router.delete(
  '/orders/:orderId',
  verifyToken,
  verifyRole(['MasterAdmin']),
  mCtrl.deleteOrder
);

module.exports = router;
