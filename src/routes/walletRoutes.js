// src/routes/walletRoutes.js
const express = require('express');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const wc = require('../controllers/walletController');

const router = express.Router();

// ─── Marketer endpoints ────────────────────────────────────────
router.get(
  '/',                           // GET  /api/wallets
  verifyToken,
  verifyRole(['Marketer']),
  wc.getMyWallet
);
router.get(
  '/stats',                      // GET  /api/wallets/stats
  verifyToken,
  verifyRole(['Marketer']),
  wc.getWalletStats
);
router.get(
  '/withdrawals',                // GET  /api/wallets/withdrawals
  verifyToken,
  verifyRole(['Marketer']),
  wc.getMyWithdrawals
);
router.post(
  '/withdraw',                   // POST /api/wallets/withdraw
  verifyToken,
  verifyRole(['Marketer']),
  wc.requestWithdrawal
);

// ─── MasterAdmin endpoints ────────────────────────────────────
router.get(
  '/master-admin/requests',      // GET  /api/wallets/master-admin/requests
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.listPendingRequests
);
router.patch(
  '/master-admin/requests/:reqId', // PATCH /api/wallets/master-admin/requests/:reqId
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.reviewRequest
);
router.post(
  '/master-admin/release-withheld', // POST /api/wallets/master-admin/release-withheld
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.releaseWithheld
);
router.post(
  '/master-admin/reset',         // POST /api/wallets/master-admin/reset
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.resetWallets
);
router.get(
  '/master-admin/wallets',       // GET  /api/wallets/master-admin/wallets
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.getAllWallets
);

// ─── SuperAdmin endpoints ─────────────────────────────────────
router.get(
  '/super-admin/activities',     // GET /api/wallets/super-admin/activities
  verifyToken,
  verifyRole(['SuperAdmin']),
  wc.getSuperAdminActivities
);
router.get(
  '/super-admin/my',             // GET /api/wallets/super-admin/my
  verifyToken,
  verifyRole(['SuperAdmin']),
  wc.getMyWallet                  // re-use your own-wallet controller
);

// ─── Admin endpoints ───────────────────────────────────────────
router.get(
  '/admin/my', verifyToken, verifyRole(['Admin']),
  wc.getMyWallet              // same as marketer’s own-wallet
);
router.get(
  '/admin/marketers', verifyToken, verifyRole(['Admin']),
  wc.getAdminWallets          // returns only this admin’s marketers
);

module.exports = router;
