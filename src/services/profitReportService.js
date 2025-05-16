// backend/src/services/profitReportService.js

const { pool } = require('../config/database');

/**
 * Get overall inventory snapshot:
 *  - expected_profit_before: sum((selling_price - cost_price) * quantity)
 *  - total_available_units: sum(quantity)
 */
async function getInventorySnapshot() {
  const sql = `
    SELECT
      SUM((p.selling_price - p.cost_price) * p.quantity)::NUMERIC(14,2) AS expected_profit_before,
      SUM(p.quantity)                                         AS total_available_units
    FROM products p;
  `;
  const { rows } = await pool.query(sql);
  return rows[0];
}

/**
 * Get daily sales from the materialized view, with optional filters:
 *  - start/end: ISO dates
 *  - deviceType, deviceName: optional
 */
async function getDailySales({ start, end, deviceType, deviceName }) {
  const conditions = [];
  const params = [start, end];

  if (deviceType) {
    params.push(deviceType);
    conditions.push(`device_type = $${params.length}`);
  }
  if (deviceName) {
    params.push(deviceName);
    conditions.push(`device_name = $${params.length}`);
  }

  const whereClause = conditions.length
    ? 'AND ' + conditions.join(' AND ')
    : '';

  const sql = `
    SELECT *
    FROM daily_sales_summary
    WHERE sale_day BETWEEN $1 AND $2
      ${whereClause}
    ORDER BY sale_day, device_type, device_name;
  `;
  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Get goals based on current product quantities and commission rates:
 *  - goal_units
 *  - goal_profit_before
 *  - goal_expenses
 *  - goal_profit_after
 */
async function getGoals() {
  const sql = `
    SELECT
      SUM(p.quantity)                                                       AS goal_units,
      SUM((p.selling_price - p.cost_price) * p.quantity)::NUMERIC(14,2)      AS goal_profit_before,
      SUM(p.quantity * (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate))::NUMERIC(14,2) AS goal_expenses,
      SUM((p.selling_price - p.cost_price) * p.quantity
          - p.quantity * (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate)
      )::NUMERIC(14,2)                                                       AS goal_profit_after
    FROM products p
    JOIN commission_rates cr ON p.device_type = cr.device_type;
  `;
  const { rows } = await pool.query(sql);
  return rows[0];
}
/**
 * Fetch full inventory details:
 *  - id, device_name, device_type, quantity, cost_price, selling_price
 *  - unit_profit, total_selling_value, total_expected_profit
 */
async function getInventoryDetails() {
  const sql = `
    SELECT
      p.id,
      p.device_name,
      p.device_type,
      p.quantity,
      p.cost_price,
      p.selling_price,
      (p.selling_price - p.cost_price)        AS unit_profit,
      (p.selling_price * p.quantity)          AS total_selling_value,
      ((p.selling_price - p.cost_price) * p.quantity) AS total_expected_profit
    FROM products p
    ORDER BY p.device_name;
  `;
  const { rows } = await pool.query(sql);
  return rows;
}


module.exports = {
  getInventorySnapshot,
  getDailySales,
  getGoals,
  getInventoryDetails,
};
