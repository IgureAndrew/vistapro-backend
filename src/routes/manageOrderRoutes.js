// src/routes/manageOrderRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require("../middlewares/roleMiddleware");

// Import controller functions from manageOrderControllers.js
const {
  getOrders,
  confirmOrderToDealer,
  confirmReleasedOrder,
  getReleasedOrderHistory,
} = require('../controllers/manageOrderController');

// List all orders (optional) - accessible by Master Admin and Admin
router.get(
  '/',
  verifyToken,
  verifyRole(["MasterAdmin", "Admin"]),
  getOrders
);

// Confirm order to dealer - Only Master Admin can perform this action.
router.patch(
  '/:orderId/confirm',
  verifyToken,
  verifyRole(["MasterAdmin"]),
  confirmOrderToDealer
);

// Confirm released order - Accessible by Master Admin and Admin.
router.patch(
  '/:orderId/confirm-release',
  verifyToken,
  verifyRole(["MasterAdmin", "Admin"]),
  confirmReleasedOrder
);

// Retrieve release order history for reconciliation - Accessible by Master Admin and Admin.
router.get(
  '/history',
  verifyToken,
  verifyRole(["MasterAdmin", "Admin"]),
  getReleasedOrderHistory
);

module.exports = router;
