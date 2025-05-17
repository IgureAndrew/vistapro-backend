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
} = require("../controllers/manageOrderController");

// ──────────────────────────────────────────────────────────
// 0) Confirm a pending order (shortcut GET for browser + PATCH for API)
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

router.get(
  '/orders/:orderId/detail',
  verifyToken,
  verifyRole('MasterAdmin'),
  getConfirmedOrderDetail
);


module.exports = router;
