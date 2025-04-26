// src/routes/walletRoutes.js
const express = require('express');
const router  = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const wc     = require('../controllers/walletController');

// ────────────────
// Marketer routes
// ────────────────
router.get(
  '/',
  verifyToken,
  verifyRole(['Marketer']),
  wc.getMyWallet
);

router.get(
  '/withdrawals',               // marketer's own withdrawal requests
  verifyToken,
  verifyRole(['Marketer']),
  wc.getMyWithdrawals
);

router.post(
  '/bank-details',
  verifyToken,
  verifyRole(['Marketer']),
  wc.createOrUpdateBankDetails
);

router.get(
  '/bank-details',
  verifyToken,
  verifyRole(['Marketer']),
  wc.getBankDetails
);

router.post(
  '/withdraw',
  verifyToken,
  verifyRole(['Marketer']),
  wc.requestWithdrawal
);

router.get(
  '/stats',
  verifyToken,
  verifyRole(['Marketer']),
  wc.getStats
);

// ────────────────
// MasterAdmin routes
// ────────────────
router.get(
  '/withdrawal-requests',      // all requests pending review
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.listAllWithdrawals
);

router.patch(
  '/withdrawal-requests/:reqId',  // approve/reject
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.reviewWithdrawalRequest
);

// ────────────────
// System / Cron (optional auth)
// ────────────────
router.post(
  '/release',
  /* add auth if needed */
  wc.releaseWithheld
);

module.exports = router;