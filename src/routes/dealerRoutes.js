// src/routes/dealerRoutes.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/authMiddleware");
const { pool } = require("../config/database");

router.get("/", verifyToken, async (req, res) => {
  try {
    // Query to fetch all dealers regardless of user location.
    const query = `
      SELECT unique_id, business_name 
      FROM users 
      WHERE role = 'Dealer'
      ORDER BY business_name ASC
    `;
    const result = await pool.query(query);
    res.status(200).json({ dealers: result.rows });
  } catch (error) {
    console.error("Error fetching dealers:", error);
    res.status(500).json({ message: "Error fetching dealers" });
  }
});

module.exports = router;
