// backend/src/services/profitReportService.js

const { pool } = require('../config/database');

// Fetch overall inventory snapshot based on available inventory_items
async function getInventorySnapshot() {
  const sql = `
    SELECT
      SUM((p.selling_price - p.cost_price) * avail.cnt)::NUMERIC(14,2) AS expected_profit_before,
      SUM(avail.cnt)                                           AS total_available_units
    FROM (
      SELECT product_id, COUNT(*) AS cnt
      FROM inventory_items
      WHERE status = 'available'
      GROUP BY product_id
    ) AS avail
    JOIN products p ON p.id = avail.product_id;
  `;
  const { rows } = await pool.query(sql);
  return rows[0];
}

// Fetch daily sales from materialized view
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

// Fetch goal metrics based on current available inventory
async function getGoals() {
  const sql = `
    SELECT
      SUM(avail.cnt)                                                           AS goal_units,
      SUM((p.selling_price - p.cost_price) * avail.cnt)::NUMERIC(14,2)         AS goal_profit_before,
      SUM(avail.cnt * (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate)) AS goal_expenses,
      (SUM((p.selling_price - p.cost_price) * avail.cnt)
       - SUM(avail.cnt * (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate))
      )::NUMERIC(14,2)                                                         AS goal_profit_after
    FROM (
      SELECT product_id, COUNT(*) AS cnt
      FROM inventory_items
      WHERE status = 'available'
      GROUP BY product_id
    ) AS avail
    JOIN products p ON p.id = avail.product_id
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
