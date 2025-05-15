const express = require('express');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const reportController = require('../controllers/reportController');

const router = express.Router();

// GET /api/report/stats
router.get(
  '/stats',
  verifyToken,
  verifyRole(['Marketer','Admin','SuperAdmin','MasterAdmin']),
  reportController.getStats      // ← make sure this function is exported below
);

module.exports = router;
