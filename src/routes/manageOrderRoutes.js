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

// GET /api/manage-orders/orders => pending orders
router.get(
  "/orders",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  getOrders
);

// PATCH to confirm an order
router.patch(
  "/:id/confirm",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  confirmOrderToDealer
);

// PATCH to confirm a released order
router.patch(
  "/:id/confirm-release",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  confirmReleasedOrder
);

// GET /api/manage-orders/history => orders history
router.get(
  "/history",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  getReleasedOrderHistory
);

module.exports = router;
