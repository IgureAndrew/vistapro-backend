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
      p.device_model,
      p.device_type,
      COALESCE(i.qty_available, 0) AS quantity,
      p.cost_price,
      p.selling_price,
      (p.selling_price - p.cost_price)                     AS unit_profit,
      (p.selling_price * COALESCE(i.qty_available, 0))     AS total_selling_value,
      ((p.selling_price - p.cost_price) * COALESCE(i.qty_available, 0))
        AS total_expected_profit
    FROM products p
    LEFT JOIN (
      SELECT
        product_id,
        COUNT(*) FILTER (WHERE status = 'available')        AS qty_available
      FROM inventory_items
      GROUP BY product_id
    ) i ON p.id = i.product_id
    WHERE COALESCE(i.qty_available, 0) > 0
    ORDER BY p.device_name;
  `;
  const { rows } = await pool.query(sql);
  return rows;
}

/**
 * Get individual products sold directly from orders:
 *  - sale_date (confirmed_at)
 *  - device_name, device_model, device_type
 *  - qty, selling_price, profit
 */
// backend/src/services/profitReportService.js

async function getProductsSold({ start, end, deviceType, deviceName }) {
  // 1) base conditions + params
  const conditions = [
    `o.status = 'released_confirmed'`,
    `o.confirmed_at::date BETWEEN $1 AND $2`
  ];
  const params = [ start, end ];

  if (deviceType) {
    params.push(deviceType);
    conditions.push(`LOWER(p.device_type) = LOWER($${params.length})`);
  }
  if (deviceName) {
    params.push(deviceName);
    conditions.push(`LOWER(p.device_name) = LOWER($${params.length})`);
  }

  // 2) stitch them into a WHERE clause
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // 3) final SQL
  const sql = `
    SELECT
      o.confirmed_at::date                         AS sale_date,
      p.device_name,
      p.device_model,
      p.device_type,
      sr.quantity_sold                             AS qty,
      p.selling_price,
      (
        (p.selling_price - p.cost_price) * sr.quantity_sold
        - (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate)
          * sr.quantity_sold
      )::NUMERIC(14,2)                             AS profit
    FROM orders o
    JOIN sales_record sr ON sr.order_id = o.id
    JOIN products p     ON p.id         = sr.product_id
    JOIN commission_rates cr
      ON LOWER(cr.device_type) = LOWER(p.device_type)
    ${whereClause}
    ORDER BY o.confirmed_at DESC;
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}


// at the bottom of profitReportService.js

/**
 * Get a per-day aggregation of sales:
 *  • sale_day
 *  • device_type, device_model, device_name
 *  • total_units_sold
 *  • total_revenue (selling_price × qty)
 *  • total_initial_profit ((price–cost) × qty)
 *  • total_marketer_commission, total_admin_commission, total_superadmin_commission
 *  • total_commission_expense (sum of 3 above)
 *  • total_final_profit (initial_profit – total_commission_expense)
 */
async function getAggregatedSales({ start, end, deviceType, deviceName }) {
  const conditions = ['sr.sale_date::date BETWEEN $1 AND $2'];
  const params     = [start, end];

  if (deviceType) {
    params.push(deviceType);
    conditions.push(`LOWER(p.device_type) = $${params.length}`);
  }
  if (deviceName) {
    params.push(deviceName);
    conditions.push(`p.device_name = $${params.length}`);
  }

  const sql = `
    SELECT
      sr.sale_date::date                              AS sale_day,
      p.device_type,
      p.device_model,
      p.device_name,
      SUM(sr.quantity_sold)                           AS total_units_sold,
      SUM(p.selling_price * sr.quantity_sold)::NUMERIC(14,2)
        AS total_revenue,
      SUM((p.selling_price - p.cost_price) * sr.quantity_sold)::NUMERIC(14,2)
        AS total_initial_profit,
      SUM(sr.quantity_sold * cr.marketer_rate)::NUMERIC(14,2)
        AS total_marketer_commission,
      SUM(sr.quantity_sold * cr.admin_rate)::NUMERIC(14,2)
        AS total_admin_commission,
      SUM(sr.quantity_sold * cr.superadmin_rate)::NUMERIC(14,2)
        AS total_superadmin_commission,
      SUM(
        sr.quantity_sold
        * (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate)
      )::NUMERIC(14,2)                                AS total_commission_expense,
      SUM(
        (p.selling_price - p.cost_price) * sr.quantity_sold
        - sr.quantity_sold * (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate)
      )::NUMERIC(14,2)                                AS total_final_profit
    FROM sales_record sr
    JOIN products p
      ON p.id = sr.product_id
    JOIN commission_rates cr
      ON LOWER(cr.device_type) = LOWER(p.device_type)
    WHERE ${conditions.join(' AND ')}
    GROUP BY sale_day, p.device_type, p.device_model, p.device_name
    ORDER BY sale_day;
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}
/**
 * Get one‐row summary for a given day (or date range):
 *  • total_units_sold
 *  • total_revenue
 *  • total_initial_profit
 *  • total_commission_expense
 *  • total_final_profit
 */
async function getDailyTotals({ start, end }) {
  const sql = `
    SELECT
      SUM(sr.quantity_sold)                                         AS total_units_sold,
      SUM(p.selling_price * sr.quantity_sold)::NUMERIC(14,2)        AS total_revenue,
      SUM((p.selling_price - p.cost_price) * sr.quantity_sold)::NUMERIC(14,2)
                                                                    AS total_initial_profit,
      SUM(sr.quantity_sold * (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate))::NUMERIC(14,2)
                                                                    AS total_commission_expense,
      SUM(
        (p.selling_price - p.cost_price) * sr.quantity_sold
        - sr.quantity_sold * (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate)
      )::NUMERIC(14,2)                                              AS total_final_profit
    FROM sales_record sr
    JOIN products p    ON p.id = sr.product_id
    JOIN commission_rates cr
      ON LOWER(cr.device_type) = LOWER(p.device_type)
    WHERE sr.sale_date::date BETWEEN $1 AND $2
  `;
  const { rows: [totals] } = await pool.query(sql, [start, end]);
  return totals;
}





module.exports = {
  getInventorySnapshot,
  getDailySales,
  getGoals,
  getInventoryDetails,
  getProductsSold,
  getAggregatedSales,    // ← newly exported
  getDailyTotals,
};
