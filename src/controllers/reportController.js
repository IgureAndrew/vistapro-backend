// src/controllers/reportController.js
// Controller functions for generating various reports

const { pool } = require('../config/database');

/**
 * calculatorModule - Calculates dealers' receivables by summing the purchase prices
 * from orders, grouped by dealer.
 */
const calculatorModule = async (req, res, next) => {
  try {
    const query = `
      SELECT dealer_id, SUM(price) as total_receivables 
      FROM orders 
      GROUP BY dealer_id
    `;
    const result = await pool.query(query);
    return res.status(200).json({
      message: "Calculator report retrieved successfully.",
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * salesReport - Retrieves sales reports. Optionally, you can filter by a date range.
 * Query parameters: startDate and endDate.
 */
const salesReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    let query = `SELECT * FROM orders WHERE status = 'released_confirmed'`;
    const values = [];
    if (startDate && endDate) {
      query += ` AND created_at BETWEEN $1 AND $2`;
      values.push(startDate, endDate);
    }
    const result = await pool.query(query, values);
    return res.status(200).json({
      message: "Sales report retrieved successfully.",
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * dailySalesProfitAnalysis - Computes daily profit using the formula:
 * Gross Profit = SUM(dealer_cost_price) - SUM(marketer_selling_price)
 * (Assumes orders table contains dealer_cost_price and marketer_selling_price columns)
 */
const dailySalesProfitAnalysis = async (req, res, next) => {
  try {
    const query = `
      SELECT date_trunc('day', created_at) as day, 
             COALESCE(SUM(dealer_cost_price), 0) as total_dealer_cost, 
             COALESCE(SUM(marketer_selling_price), 0) as total_marketer_selling
      FROM orders 
      WHERE status = 'released_confirmed'
      GROUP BY day
      ORDER BY day DESC
    `;
    const result = await pool.query(query);
    const profitData = result.rows.map(row => ({
      day: row.day,
      totalDealerCost: row.total_dealer_cost,
      totalMarketerSelling: row.total_marketer_selling,
      grossProfit: row.total_dealer_cost - row.total_marketer_selling
    }));
    return res.status(200).json({
      message: "Daily profit report retrieved successfully.",
      data: profitData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getDeviceSalesReport - Retrieves a report on device sales, aggregated by device category
 * and grouped over a specified interval (daily, weekly, monthly, or yearly).
 * Query parameter: interval (defaults to daily)
 */
const getDeviceSalesReport = async (req, res, next) => {
  try {
    const { interval } = req.query; // e.g., daily, weekly, monthly, yearly
    let groupByClause;
    switch (interval) {
      case "weekly":
        groupByClause = "date_trunc('week', created_at)";
        break;
      case "monthly":
        groupByClause = "date_trunc('month', created_at)";
        break;
      case "yearly":
        groupByClause = "date_trunc('year', created_at)";
        break;
      case "daily":
      default:
        groupByClause = "date_trunc('day', created_at)";
    }
    const query = `
      SELECT ${groupByClause} AS period, device_category, COUNT(*) AS devices_sold
      FROM orders
      WHERE status = 'released_confirmed'
      GROUP BY period, device_category
      ORDER BY period DESC
    `;
    const result = await pool.query(query);
    return res.status(200).json({
      message: "Device sales report retrieved successfully.",
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * dealersPaymentHistory - Retrieves the payment history for dealers.
 * Assumes there is a table "dealer_payments" with a column "payment_date".
 */
const dealersPaymentHistory = async (req, res, next) => {
  try {
    const query = `
      SELECT * FROM dealer_payments
      ORDER BY payment_date DESC
    `;
    const result = await pool.query(query);
    return res.status(200).json({
      message: "Dealer payment history retrieved successfully.",
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * marketersPaymentHistory - Retrieves the payment history for marketers.
 * Assumes there is a table "marketer_payments" with a column "payment_date".
 */
const marketersPaymentHistory = async (req, res, next) => {
  try {
    const query = `
      SELECT * FROM marketer_payments
      ORDER BY payment_date DESC
    `;
    const result = await pool.query(query);
    return res.status(200).json({
      message: "Marketer payment history retrieved successfully.",
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * generalExpenses - Retrieves general expenses.
 * Assumes there is a table "general_expenses" with a column "expense_date".
 */
const generalExpenses = async (req, res, next) => {
  try {
    const query = `
      SELECT * FROM general_expenses
      ORDER BY expense_date DESC
    `;
    const result = await pool.query(query);
    return res.status(200).json({
      message: "General expenses retrieved successfully.",
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getSalesReport - Returns aggregated sales data.
 * This example aggregates orders by day, week, and month.
 */
const getSalesReport = async (req, res, next) => {
  try {
    // Daily report: orders and total sales for today
    const dailyRes = await pool.query(`
      SELECT COUNT(*) AS order_count, COALESCE(SUM(price), 0) AS total_sales 
      FROM orders 
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    // Weekly report: orders and total sales for the last 7 days
    const weeklyRes = await pool.query(`
      SELECT COUNT(*) AS order_count, COALESCE(SUM(price), 0) AS total_sales 
      FROM orders 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    `);
    // Monthly report: orders and total sales for the current month
    const monthlyRes = await pool.query(`
      SELECT COUNT(*) AS order_count, COALESCE(SUM(price), 0) AS total_sales 
      FROM orders 
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
    `);

    res.status(200).json({
      daily: dailyRes.rows[0],
      weekly: weeklyRes.rows[0],
      monthly: monthlyRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  calculatorModule,
  salesReport,
  dailySalesProfitAnalysis,
  getDeviceSalesReport,
  dealersPaymentHistory,
  marketersPaymentHistory,
  generalExpenses,
  getSalesReport
};
