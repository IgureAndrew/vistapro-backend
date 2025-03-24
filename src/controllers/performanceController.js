// src/controllers/performanceController.js
// Controller for performance metrics

const { pool } = require('../config/database');

/**
 * getPerformanceOverview - Retrieves overall performance metrics.
 * Returns total orders, total sales, and average order value for orders with status 'released_confirmed'.
 * In a more advanced implementation, you can filter or group data based on user role or date ranges.
 */
const getPerformanceOverview = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        COUNT(*) AS total_orders,
        COALESCE(SUM(price), 0) AS total_sales,
        COALESCE(AVG(price), 0) AS average_order_value
      FROM orders
      WHERE status = 'released_confirmed'
    `;
    const result = await pool.query(query);
    
    return res.status(200).json({
      message: "Performance overview retrieved successfully.",
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPerformanceOverview
};
