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
  getConfirmedOrderDetail,
  cancelOrder,                 // ← new import
} = require("../controllers/manageOrderController");

// ──────────────────────────────────────────────────────────
// 0) Confirm a pending order
//    GET  /api/manage-orders/orders/:orderId/confirm
//    PATCH /api/manage-orders/orders/:orderId/confirm
// ──────────────────────────────────────────────────────────
router
  .route("/orders/:orderId/confirm")
  .all(verifyToken, verifyRole(["MasterAdmin"]))
  .get(confirmOrder)
  .patch(confirmOrder);

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
// 1a) Cancel an order (new)
//    PATCH /api/manage-orders/orders/:orderId/cancel
// ──────────────────────────────────────────────────────────
router.patch(
  "/orders/:orderId/cancel",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  cancelOrder
);

// ──────────────────────────────────────────────────────────
// 2) Order History
//    GET /api/manage-orders/orders/history
// ──────────────────────────────────────────────────────────
router.get(
  "/orders/history",
  verifyToken,
  verifyRole(["MasterAdmin","SuperAdmin","Admin"]),
  getOrderHistory
);

// ──────────────────────────────────────────────────────────
// 3) Confirm to dealer
//    PATCH /api/manage-orders/orders/:orderId/confirm-to-dealer
// ──────────────────────────────────────────────────────────
router.patch(
  "/orders/:orderId/confirm-to-dealer",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  confirmOrderToDealer
);

// ──────────────────────────────────────────────────────────
// 4) Update an order
//    PUT /api/manage-orders/orders/:orderId
// ──────────────────────────────────────────────────────────
router.put(
  "/orders/:orderId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  updateOrder
);

// ──────────────────────────────────────────────────────────
// 5) Delete an order
//    DELETE /api/manage-orders/orders/:orderId
// ──────────────────────────────────────────────────────────
router.delete(
  "/orders/:orderId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  deleteOrder
);

// ──────────────────────────────────────────────────────────
// 6) Order Detail (no-op for avoiding 404s)
//    GET /api/manage-orders/orders/:orderId/detail
// ──────────────────────────────────────────────────────────
router.get(
  "/orders/:orderId/detail",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  getConfirmedOrderDetail
);

module.exports = router;
