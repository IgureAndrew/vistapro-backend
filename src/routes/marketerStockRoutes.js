// src/routes/marketerStockRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const { acceptStockUpdate } = require('../controllers/marketerStockController');

// Endpoint: Marketer cannot hold stock for more than 24 hours.
// This endpoint checks unsold stock and marks it as returned to store.
router.post('/accept-update', verifyToken, verifyRole(['Marketer']), acceptStockUpdate);

module.exports = router;
