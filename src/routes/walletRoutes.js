// src/routes/walletRoutes.js
const express = require('express');
const router = express.Router();

// split your middlewares
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole }  = require('../middlewares/roleMiddleware');

const {
  creditCommission,
  requestWithdrawal,
  listWithdrawalRequests,
  reviewWithdrawalRequest,
  getMyWallet
} = require('../controllers/walletController');

// Marketer: view your wallet & recent txns
router.get(
  '/wallet',                       // GET /wallet
  verifyToken,
  verifyRole(['Marketer']),
  getMyWallet
);

// Marketer: request a withdrawal
router.post(
  '/wallet/withdrawals',           // POST /wallet/withdrawals
  verifyToken,
  verifyRole(['Marketer']),
  requestWithdrawal
);

// MasterAdmin: list all pending withdrawal requests
router.get(
  '/wallet/withdrawals',           // GET /wallet/withdrawals
  verifyToken,
  verifyRole(['MasterAdmin']),
  listWithdrawalRequests
);

// MasterAdmin: approve or reject a withdrawal request
router.patch(
  '/wallet/withdrawals/:reqId',    // PATCH /wallet/withdrawals/:reqId
  verifyToken,
  verifyRole(['MasterAdmin']),
  reviewWithdrawalRequest
);

// MasterAdmin: credit a marketer’s commission
router.post(
  '/wallet/commission',            // POST /wallet/commission
  verifyToken,
  verifyRole(['MasterAdmin']),
  creditCommission
);

module.exports = router;
