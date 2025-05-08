// src/routes/walletRoutes.js

const express = require('express');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const wc = require('../controllers/walletController');

const router = express.Router();

// ─── Marketer endpoints ────────────────────────────────────────
// All require a valid token + role "Marketer"
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

// ─── Admin/SuperAdmin endpoints ────────────────────────────────
// List all pending withdrawal requests
router.get(
  '/master-admin/requests',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.listPendingRequests
);
// Approve/reject a withdrawal
router.patch(
  '/master-admin/requests/:reqId',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.reviewRequest
);
// Release all withheld balances → available
router.post(
  '/master-admin/release-withheld',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.releaseWithheld
);
// Reset everyone’s wallets & txns
router.post(
  '/master-admin/reset',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.resetWallets
);
// View all marketers’ wallets
router.get(
  '/master-admin/wallets',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.getAllWallets
);

router.get(
  '/super-admin/activities',
  verifyToken,
  verifyRole(['SuperAdmin']),
  wc.getSuperAdminActivities
);

module.exports = router;
