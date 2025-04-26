const express = require('express');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const wc = require('../controllers/walletController');
const router = express.Router();

// Marketer
router.get('/',                verifyToken, verifyRole(['Marketer']), wc.getMyWallet);
router.get('/withdrawals',     verifyToken, verifyRole(['Marketer']), wc.getMyWithdrawals);
router.post('/withdraw',       verifyToken, verifyRole(['Marketer']), wc.requestWithdrawal);

// MasterAdmin
router.get(
  '/requests',
  verifyToken, verifyRole(['MasterAdmin']),
  wc.listPending
);
router.patch(
  '/requests/:reqId',
  verifyToken, verifyRole(['MasterAdmin']),
  wc.review
);

module.exports = router;
