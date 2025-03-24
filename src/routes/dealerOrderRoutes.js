// src/routes/dealerOrderRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const {
  getOrderList,
  sendReleaseOrderNotice,
  confirmReleasedOrder,
  getReleaseOrderHistory
} = require('../controllers/dealerOrderController');

// All endpoints in this module are for Dealers only.
router.get('/list', verifyToken, verifyRole(['Dealer']), getOrderList);
router.post('/release-notice', verifyToken, verifyRole(['Dealer']), sendReleaseOrderNotice);
router.post('/confirm-release', verifyToken, verifyRole(['Dealer']), confirmReleasedOrder);
router.get('/history', verifyToken, verifyRole(['Dealer']), getReleaseOrderHistory);

module.exports = router;
