const express = require('express');
const { verifyToken } = require('../middlewares/authMiddleware');
const { profitReport } = require('../controllers/profitReportController');

const router = express.Router();

// GET /api/profit-report?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', verifyToken, profitReport);

module.exports = router;
