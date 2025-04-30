// src/routes/dealerRoutes.js
const express = require("express");
const multer  = require("multer");
const { pool } = require("../config/database");
const { verifyToken } = require("../middlewares/authMiddleware");
const { verifyRole }  = require("../middlewares/roleMiddleware");
const {
  getAccountSettings,
  updateAccountSettings,
  uploadInventory,
  getOrderHistory
} = require("../controllers/dealerController");

const router = express.Router();

// In-memory storage for file uploads
const upload = multer({ storage: multer.memoryStorage() });

/**
 * ── MasterAdmin: list all dealers ───────────────────────────────────────
 */
router.get(
  "/",
  verifyToken,
  verifyRole(["MasterAdmin"]),   // only MasterAdmin can list everyone
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT id, unique_id, business_name, email, location, locked FROM users WHERE role = 'Dealer'"
      );
      res.json({ dealers: rows });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

/**
 * ── Dealer: view & update own account ─────────────────────────────────
 */
router
  .route("/account")
  // GET  /api/dealer/account
  .get(
    verifyToken,
    verifyRole(["Dealer"]),
    getAccountSettings
  )
  // PATCH /api/dealer/account
  .patch(
    verifyToken,
    verifyRole(["Dealer"]),
    upload.fields([
      { name: "cacCertificate", maxCount: 1 },
      { name: "profileImage",    maxCount: 1 }
    ]),
    updateAccountSettings
  );

/**
 * ── Dealer: manage inventory ────────────────────────────────────────────
 */
router.post(
  "/inventory",
  verifyToken,
  verifyRole(["Dealer"]),
  upload.none(),   // no file expected here
  uploadInventory
);

/**
 * ── Dealer: view own order history ─────────────────────────────────────
 */
router.get(
  "/orders",
  verifyToken,
  verifyRole(["Dealer"]),
  getOrderHistory
);

module.exports = router;
