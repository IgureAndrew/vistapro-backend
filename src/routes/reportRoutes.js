// src/routes/reportRoutes.js
const express = require('express');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const rc = require('../controllers/reportController');

const router = express.Router();

// only MasterAdmin (or above) may view reports
router.use(verifyToken, verifyRole(['MasterAdmin']));

// profit
router.get('/reports/profit',                  rc.getTotalProfitReport);

// sales
router.get('/reports/sales/marketer',          rc.getSalesByMarketerReport);
router.get('/reports/sales/admin',             rc.getSalesByAdminReport);
router.get('/reports/sales/superadmin',        rc.getSalesBySuperAdminReport);

// commissions
router.get('/reports/commission/admin',        rc.getCommissionByAdminReport);
router.get('/reports/commission/superadmin',   rc.getCommissionBySuperAdminReport);

// device‐sales
router.get('/reports/device-sales',            rc.getDeviceSalesReport);

module.exports = router;
