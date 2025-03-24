// src/routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require("../middlewares/roleMiddleware"); 
const {
  calculatorModule,
  salesReport,
  dailySalesProfitAnalysis,
  dealersPaymentHistory,
  marketersPaymentHistory,
  generalExpenses,
  getSalesReport
} = require('../controllers/reportController');

// Protected route: Calculator module for dealer receivables
router.get('/calculator', verifyToken, calculatorModule);

// Protected route: Sales report for filtering by date range
// Renamed to '/sales/raw' to avoid conflict with the aggregated endpoint below.
router.get('/sales/raw', verifyToken, salesReport);

// Protected route: Daily sales profit analysis
router.get('/profit', verifyToken, dailySalesProfitAnalysis);

// Protected route: Dealer payment history
router.get('/dealers-payments', verifyToken, dealersPaymentHistory);

// Protected route: Marketer payment history
router.get('/marketers-payments', verifyToken, marketersPaymentHistory);

// Protected route: General expenses report
router.get('/expenses', verifyToken, generalExpenses);

// Only Master Admin, Super Admin or Admin can access aggregated sales data.
router.get(
  "/sales",
  verifyToken,
  verifyRole(["MasterAdmin", "SuperAdmin", "Admin"]),
  getSalesReport
);

module.exports = router;
