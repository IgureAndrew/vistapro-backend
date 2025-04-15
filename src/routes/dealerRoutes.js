// src/routes/dealerRoutes.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/authMiddleware");

router.get("/", verifyToken, async (req, res) => {
  try {
    // Select dealers from the users table where role = 'Dealer'
    const result = await pool.query("SELECT * FROM users WHERE role = 'Dealer'");
    res.json({ dealers: result.rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
