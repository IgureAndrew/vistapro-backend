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
// only MasterAdmin can list & review withdrawal requests
router.get(
  '/requests',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.listPending
);

router.patch(
  '/requests/:reqId',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.review
);

module.exports = router;
