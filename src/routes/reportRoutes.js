// src/routes/reportRoutes.js
const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole }  = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/reportController');

// all routes protected, only MasterAdmin/Admin/SuperAdmin can access
const ROLES = ['MasterAdmin','Admin','SuperAdmin'];

router.get(
  '/profit',
  verifyToken,
  verifyRole(ROLES),
  ctrl.getTotalProfitReport
);

router.get(
  '/sales/marketer',
  verifyToken,
  verifyRole(ROLES),
  ctrl.getSalesByMarketerReport
);

router.get(
  '/sales/admin',
  verifyToken,
  verifyRole(ROLES),
  ctrl.getSalesByAdminReport
);

router.get(
  '/sales/superadmin',
  verifyToken,
  verifyRole(ROLES),
  ctrl.getSalesBySuperAdminReport
);

router.get(
  '/commission/admin',
  verifyToken,
  verifyRole(ROLES),
  ctrl.getCommissionByAdminReport
);

router.get(
  '/commission/superadmin',
  verifyToken,
  verifyRole(ROLES),
  ctrl.getCommissionBySuperAdminReport
);

router.get(
  '/device-sales',
  verifyToken,
  verifyRole(ROLES),
  ctrl.getDeviceSalesReport
);

module.exports = router;
