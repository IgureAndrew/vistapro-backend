// src/routes/manageOrderRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const {
  getOrders,
  confirmOrderToDealer,
  confirmReleasedOrder,
  getReleasedOrderHistory,
} = require('../controllers/manageOrderController');

// GET /api/manage-orders
// Retrieves orders placed by marketers that are pending confirmation.
router.get(
  "/orders",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  getOrders
);

// PATCH /api/manage-orders/:id/confirm
// Allows Master Admin to confirm an order (i.e. update status to "confirmed_to_dealer").
router.patch(
  "/:id/confirm",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  confirmOrderToDealer
);

// PATCH /api/manage-orders/:id/confirm-release
// Allows Admin or Master Admin to confirm that a released order has been delivered.
router.patch(
  "/:id/confirm-release",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  confirmReleasedOrder
);

// GET /api/manage-orders/history
// Retrieves the history of orders that have been processed.
router.get(
  "/history",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  getReleasedOrderHistory
);

module.exports = router;
