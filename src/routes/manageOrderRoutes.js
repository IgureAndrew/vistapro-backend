// src/routes/manageOrderRoutes.js
const express = require("express");
const router  = express.Router();
const { verifyToken }  = require("../middlewares/authMiddleware");
const { verifyRole }   = require("../middlewares/roleMiddleware");
const {
  getPendingOrders,
  confirmOrder,
  confirmOrderToDealer,
  getOrderHistory,
  updateOrder,
  deleteOrder,
} = require("../controllers/manageOrderController");

// ──────────────────────────────────────────────────────────
// 0) (Optional) GET shortcut—so visiting this URL in browser
//    will also trigger confirmOrder.
// ──────────────────────────────────────────────────────────
router.get(
  "/orders/:orderId/confirm",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  (req, res, next) => confirmOrder(req, res, next)
);

// ──────────────────────────────────────────────────────────
// 1) Pending Orders
//    GET /api/manage-orders/orders
// ──────────────────────────────────────────────────────────
router.get(
  "/orders",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  getPendingOrders
);

// ──────────────────────────────────────────────────────────
// 2) Order History
//    GET /api/manage-orders/orders/history
//    (Master/Super/Admin as appropriate)
// ──────────────────────────────────────────────────────────
router.get(
  "/orders/history",
  verifyToken,
  verifyRole(["MasterAdmin","SuperAdmin","Admin"]),
  getOrderHistory
);

// ──────────────────────────────────────────────────────────
// 3) Confirm a pending order
//    PATCH /api/manage-orders/orders/:orderId/confirm
// ──────────────────────────────────────────────────────────
router.patch(
  "/orders/:orderId/confirm",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  confirmOrder
);

// ──────────────────────────────────────────────────────────
// 4) Confirm to dealer
//    PATCH /api/manage-orders/orders/:orderId/confirm-to-dealer
// ──────────────────────────────────────────────────────────
router.patch(
  "/orders/:orderId/confirm-to-dealer",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  confirmOrderToDealer
);

// ──────────────────────────────────────────────────────────
// 5) Update an order
//    PUT /api/manage-orders/orders/:orderId
// ──────────────────────────────────────────────────────────
router.put(
  "/orders/:orderId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  updateOrder
);

// ──────────────────────────────────────────────────────────
// 6) Delete an order
//    DELETE /api/manage-orders/orders/:orderId
// ──────────────────────────────────────────────────────────
router.delete(
  "/orders/:orderId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  deleteOrder
);

module.exports = router;
