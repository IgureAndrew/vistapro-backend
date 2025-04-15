const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');

// Assuming you have a PostgreSQL pool instance imported
const { pool } = require('../config/database');

// GET /api/dealers - Retrieve a list of available dealers.
router.get('/', verifyToken, async (req, res, next) => {
  try {
    // Adjust the query based on your dealers table schema.
    const query = "SELECT unique_id, business_name, location FROM dealers ORDER BY business_name";
    const result = await pool.query(query);
    res.status(200).json({ dealers: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
