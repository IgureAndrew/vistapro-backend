// src/routes/marketerVerificationRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const { getVerificationStatus, submitVerification } = require('../controllers/marketerVerificationController');

// Get current verification status (for the logged-in marketer)
router.get('/', verifyToken, verifyRole(['Marketer']), getVerificationStatus);

// Submit verification details (e.g., agreement signed, bank details)
router.post('/', verifyToken, verifyRole(['Marketer']), submitVerification);

module.exports = router;
