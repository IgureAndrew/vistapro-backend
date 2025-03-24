// src/controllers/profitReportController.js
// Controller functions for profit reports

const { pool } = require('../config/database');

// Set a fixed profit margin for demonstration purposes
const PROFIT_MARGIN = 0.7; // 70%

/**
 * dailyProfitReport - Aggregates profit on a daily basis.
 * Returns each day and the calculated profit.
 */
const dailyProfitReport = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        date_trunc('day', created_at) as day, 
        SUM(price) as total_sales,
        SUM(price) * ${PROFIT_MARGIN} as profit
      FROM orders
      WHERE status = 'released_confirmed'
      GROUP BY day
      ORDER BY day DESC;
    `;
    const result = await pool.query(query);

    return res.status(200).json({
      message: "Daily profit report retrieved successfully.",
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * weeklyProfitReport - Aggregates profit on a weekly basis.
 * Returns each week and the calculated profit.
 */
const weeklyProfitReport = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        date_trunc('week', created_at) as week, 
        SUM(price) as total_sales,
        SUM(price) * ${PROFIT_MARGIN} as profit
      FROM orders
      WHERE status = 'released_confirmed'
      GROUP BY week
      ORDER BY week DESC;
    `;
    const result = await pool.query(query);

    return res.status(200).json({
      message: "Weekly profit report retrieved successfully.",
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * monthlyProfitReport - Aggregates profit on a monthly basis.
 * Returns each month and the calculated profit.
 */
const monthlyProfitReport = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        date_trunc('month', created_at) as month, 
        SUM(price) as total_sales,
        SUM(price) * ${PROFIT_MARGIN} as profit
      FROM orders
      WHERE status = 'released_confirmed'
      GROUP BY month
      ORDER BY month DESC;
    `;
    const result = await pool.query(query);

    return res.status(200).json({
      message: "Monthly profit report retrieved successfully.",
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  dailyProfitReport,
  weeklyProfitReport,
  monthlyProfitReport
};
