// src/routes/stockRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const {
  addStock,
  getStock,
  updateStock,
  deleteStock,
  updateStaleStock,
} = require('../controllers/stockController');

// Route: Add a new stock item (accessible by Marketers)
router.post('/', verifyToken, verifyRole(["Marketer"]), addStock);

// Route: Get stock items (can be filtered by marketer id via query parameter if needed)
router.get('/', verifyToken, getStock);

// Route: Update a stock item by id (accessible by the owner or Admin, adjust as needed)
router.put('/:id', verifyToken, updateStock);

// Route: Delete a stock item by id (accessible by the owner or Admin)
router.delete('/:id', verifyToken, deleteStock);

// Route: Update stale stock items (mark them as stale if held over 4 days)
// This endpoint is accessible by the authenticated marketer.
router.patch('/stale/update', verifyToken, updateStaleStock);

module.exports = router;
