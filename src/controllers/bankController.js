// controllers/bankController.js
const { pool } = require('../config/database');

const getBanks = async (req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM banks ORDER BY name");
    res.status(200).json({
      message: "Banks retrieved successfully.",
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getBanks };
