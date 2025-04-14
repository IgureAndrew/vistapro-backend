// src/routes/dealerRoutes.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/authMiddleware");
const { pool } = require("../config/database");

router.get("/", verifyToken, async (req, res) => {
  try {
    // If the authenticated user is a Master Admin,
    // then fetch all dealers (ignoring location), since all users are in the same table.
    if (req.user.role === "MasterAdmin") {
      const query = `
        SELECT unique_id, business_name 
        FROM users 
        WHERE role = 'Dealer'
        ORDER BY business_name ASC
      `;
      const result = await pool.query(query);
      return res.status(200).json({ dealers: result.rows });
    }

    // Otherwise (for example, for a Marketer), use the marketer's location
    // to filter which dealers are returned.
    const marketerLocation = req.user.location;
    if (!marketerLocation) {
      return res.status(400).json({ message: "Marketer location not available." });
    }
    const query = `
      SELECT unique_id, business_name 
      FROM users 
      WHERE role = 'Dealer' AND location = $1
      ORDER BY business_name ASC
    `;
    const result = await pool.query(query, [marketerLocation]);
    res.status(200).json({ dealers: result.rows });
  } catch (error) {
    console.error("Error fetching dealers:", error);
    res.status(500).json({ message: "Error fetching dealers" });
  }
});

module.exports = router;
