// src/routes/walletRoutes.js
const express = require('express');
const router  = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const wc = require('../controllers/walletController');

// Marketer
router.get('/',                      verifyToken, verifyRole(['Marketer']), wc.getMyWallet);
router.post('/bank-details',        verifyToken, verifyRole(['Marketer']), wc.createOrUpdateBankDetails);
router.get('/bank-details',         verifyToken, verifyRole(['Marketer']), wc.getBankDetails);
router.post('/withdraw',            verifyToken, verifyRole(['Marketer']), wc.requestWithdrawal);
router.get('/stats',                verifyToken, verifyRole(['Marketer']), wc.getStats);

// MasterAdmin
router.get('/withdrawals',          verifyToken, verifyRole(['MasterAdmin']), wc.listWithdrawalRequests);
router.patch('/withdrawals/:reqId', verifyToken, verifyRole(['MasterAdmin']), wc.reviewWithdrawalRequest);

// System cron (protect with an API key or internal token)
router.post('/release',             /* auth if needed */ wc.releaseWithheld);

module.exports = router;
