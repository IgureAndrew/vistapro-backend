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
  '/master-admin/requests/:reqId',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.reviewRequest
);

// release all withheld balances to available
router.post(
  '/master/:userId/release-withheld',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.releaseWithheld
);



module.exports = router;
