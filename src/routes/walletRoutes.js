const express = require('express');
const router  = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const {
  requestWithdrawal,
  listWithdrawalRequests,
  reviewWithdrawalRequest,
  getMyWallet,
  creditCommission
} = require('../controllers/walletController');

// Marketer
router.get(
  '/wallets',
  verifyToken,
  verifyRole(['Marketer']),
  getMyWallet
);
router.post(
  '/wallets/withdraw',
  verifyToken,
  verifyRole(['Marketer']),
  requestWithdrawal
);

// MasterAdmin
router.get(
  '/master-admin/wallets/withdrawals',
  verifyToken,
  verifyRole(['MasterAdmin']),
  listWithdrawalRequests
);
router.patch(
  '/master-admin/wallets/withdrawals/:reqId',
  verifyToken,
  verifyRole(['MasterAdmin']),
  reviewWithdrawalRequest
);
router.post(
  '/master-admin/wallets/credit',
  verifyToken,
  verifyRole(['MasterAdmin']),
  creditCommission
);

module.exports = router;
