// src/routes/manageOrderRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const {
  getOrders,
  confirmOrder,
  confirmOrderToDealer,
  getOrderHistory,
  updateOrder,
  deleteOrder,
} = require('../controllers/manageOrderController');

// GET /api/manage-orders/orders -> Retrieve pending orders created by marketers.
router.get(
  "/orders",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  getOrders
);

// PATCH /api/manage-orders/confirm -> Confirm a pending order (Master Admin confirms order).
// Expects { orderId: <id> } in the request body.
router.patch(
  '/orders/:orderId/confirm',
  verifyToken,
  verifyRole(["MasterAdmin"]),
  confirmOrder
);

// PATCH /api/manage-orders/:id/confirm-to-dealer -> Confirm an order for dealers.
router.patch(
  "/:id/confirm-to-dealer",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  confirmOrderToDealer
);

// GET /api/manage-orders/history -> Retrieve order history based on the logged in user's role.
// Master Admin sees all orders; SuperAdmin and Admin see filtered orders as per their assigned marketers.
router.get(
  "/history",
  verifyToken,
  verifyRole(["MasterAdmin", "SuperAdmin", "Admin"]),
  getOrderHistory
);

// PUT /api/manage-orders/update -> Update an order (Master Admin only).
router.put(
  "/update",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  updateOrder
);

// DELETE /api/manage-orders/:id -> Delete an order (Master Admin only).
router.delete(
  "/:id",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  deleteOrder
);

module.exports = router;
