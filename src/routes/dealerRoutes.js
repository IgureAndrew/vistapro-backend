// src/routes/dealerRoutes.js )
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { pool } = require('../config/database');

router.get('/', verifyToken, async (req, res) => {
  try {
    // Get the marketer's location from the authenticated user.
    const marketerLocation = req.user.location;
    if (!marketerLocation) {
      return res.status(400).json({ message: "Marketer location not available." });
    }
    // Query dealers with role 'Dealer' who are in the same location.
    const query = `
      SELECT unique_id, business_name 
      FROM users 
      WHERE role = 'Dealer' AND location = $1
      ORDER BY business_name ASC
    `;
    const result = await pool.query(query, [marketerLocation]);
    res.status(200).json({ dealers: result.rows });
  } catch (error) {
    console.error("Error fetching dealers by location:", error);
    res.status(500).json({ message: "Error fetching dealers" });
  }
});

module.exports = router;
