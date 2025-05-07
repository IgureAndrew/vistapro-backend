// src/routes/walletRoutes.js
const express = require('express');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const wc = require('../controllers/walletController');

const router = express.Router();

// ─── Marketer routes ────────────────────────────────────────
// all of these require a valid token + Marketer role
router.get(
  '/',
  verifyToken,
  verifyRole(['Marketer']),
  wc.getMyWallet
);

router.get(
  '/stats',
  verifyToken,
  verifyRole(['Marketer']),
  wc.getWalletStats
);

router.get(
  '/withdrawals',
  verifyToken,
  verifyRole(['Marketer']),
  wc.getMyWithdrawals
);

router.post(
  '/withdraw',
  verifyToken,
  verifyRole(['Marketer']),
  wc.requestWithdrawal
);

// ─── MasterAdmin routes ──────────────────────────────────────
// list all marketers’ wallet balances
router.get(
  '/master-admin/wallets',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.getAllWallets
);

// list pending withdrawal requests
router.get(
  '/master-admin/requests',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.listPendingRequests
);

// approve or reject a withdrawal request
router.patch(
  '/master-admin/requests/:id',        // ← change reqId → id
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.reviewRequest
);

// release all withheld balances to available for a single user
router.post(
  '/master-admin/:userId/release-withheld',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.releaseWithheld
);

// **NEW**: zero‐out every wallet & delete all transactions
router.post(
  '/master-admin/reset',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.resetWallets
);

module.exports = router;
