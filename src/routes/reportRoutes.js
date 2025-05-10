// src/routes/reportRoutes.js
const express = require('express');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const rc = require('../controllers/reportController');

const router = express.Router();

// only MasterAdmin (or above) may view reports
router.use(verifyToken, verifyRole(['MasterAdmin']));

// ─── Profit ───────────────────────────────────────────────
router.get('/profit',                rc.getTotalProfitReport);

// ─── Sales ────────────────────────────────────────────────
router.get('/sales/marketer',        rc.getSalesByMarketerReport);
router.get('/sales/admin',           rc.getSalesByAdminReport);
router.get('/sales/superadmin',      rc.getSalesBySuperAdminReport);

// ─── Commissions ──────────────────────────────────────────
router.get('/commission/admin',      rc.getCommissionByAdminReport);
router.get('/commission/superadmin', rc.getCommissionBySuperAdminReport);

// ─── Device‐Sales ─────────────────────────────────────────
router.get('/device-sales',          rc.getDeviceSalesReport);

module.exports = router;
