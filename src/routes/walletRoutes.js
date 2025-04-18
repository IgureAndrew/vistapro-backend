// src/routes/walletRoutes.js
const express = require('express');
const router  = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const {
  requestWithdrawal,
  listWithdrawalRequests,
  reviewWithdrawalRequest,
  getMyWallet,
} = require('../controllers/walletController');

// Marketer endpoints (now at /api/wallets/)
router.get(
  '/',                              // GET  /api/wallets
  verifyToken,
  verifyRole(['Marketer']),
  getMyWallet
);
router.post(
  '/withdraw',                      // POST /api/wallets/withdraw
  verifyToken,
  verifyRole(['Marketer']),
  requestWithdrawal
);

// MasterAdmin endpoints (now at /api/wallets/withdrawals)
router.get(
  '/withdrawals',                   // GET  /api/wallets/withdrawals
  verifyToken,
  verifyRole(['MasterAdmin']),
  listWithdrawalRequests
);
router.patch(
  '/withdrawals/:reqId',            // PATCH /api/wallets/withdrawals/:reqId
  verifyToken,
  verifyRole(['MasterAdmin']),
  reviewWithdrawalRequest
);

module.exports = router;
