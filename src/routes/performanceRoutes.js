// src/routes/performanceRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyNotMasterAdmin } = require('../middlewares/roleMiddleware');
const { getPerformanceOverview } = require('../controllers/performanceController');

// Protected route: Get performance overview for authenticated users
// Excludes Master Admins via verifyNotMasterAdmin middleware.
router.get('/overview', verifyToken, verifyNotMasterAdmin, getPerformanceOverview);

module.exports = router;
