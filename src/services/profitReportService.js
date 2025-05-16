// backend/src/services/profitReportService.js

const { pool } = require('../config/database');

async function getInventorySnapshot() {
  const sql = `
    SELECT
      SUM((selling_price - cost_price) * available_quantity)::NUMERIC(14,2) AS expected_profit_before,
      SUM(available_quantity)                              AS total_available_units
    FROM products;
  `;
  const { rows } = await pool.query(sql);
  return rows[0];
}

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

async function getGoals() {
  const sql = `
    SELECT
      SUM(available_quantity)                                                   AS goal_units,
      SUM((selling_price - cost_price) * available_quantity)::NUMERIC(14,2)      AS goal_profit_before,
      SUM(available_quantity * (marketer_rate + admin_rate + superadmin_rate)) AS goal_expenses,
      (SUM((selling_price - cost_price) * available_quantity)
       - SUM(available_quantity * (marketer_rate + admin_rate + superadmin_rate))
      )::NUMERIC(14,2)                                                          AS goal_profit_after
    FROM products p
    JOIN commission_rates cr ON p.device_type = cr.device_type;
  `;
  const { rows } = await pool.query(sql);
  return rows[0];
}

module.exports = {
  getInventorySnapshot,
  getDailySales,
  getGoals
};
