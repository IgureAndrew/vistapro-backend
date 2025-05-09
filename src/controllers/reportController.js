// src/controllers/reportController.js
const { pool } = require('../config/database');

/**
 * Helper to pick the right date_trunc clause for intervals.
 */
function getTrunc(interval) {
  switch ((interval||'daily').toLowerCase()) {
    case 'weekly':    return "date_trunc('week', o.sale_date)";
    case 'monthly':   return "date_trunc('month', o.sale_date)";
    case 'quarterly': return "date_trunc('quarter', o.sale_date)";
    case 'yearly':    return "date_trunc('year', o.sale_date)";
    case 'daily':
    default:          return "date_trunc('day', o.sale_date)";
  }
}

/**
 * GET /api/reports/profit
 */
async function getTotalProfitReport(req, res, next) {
  try {
    const trunc = getTrunc(req.query.interval);
    const sql = `
      SELECT
        ${trunc}                                       AS period,
        COALESCE(SUM(o.earnings_per_device * o.number_of_devices),0) AS raw_profit,
        COALESCE(SUM(
          CASE p.device_type
            WHEN 'android' THEN 10000
            WHEN 'iphone'  THEN 15000
            ELSE 0
          END * o.number_of_devices
        ),0)                                            AS marketer_commission,
        COALESCE(SUM(1500 * o.number_of_devices),0)      AS admin_commission,
        COALESCE(SUM(1000 * o.number_of_devices),0)      AS superadmin_commission,
        -- net profit = raw minus all commissions
        COALESCE(SUM(o.earnings_per_device * o.number_of_devices),0)
        - COALESCE(SUM(
            CASE p.device_type
              WHEN 'android' THEN 10000
              WHEN 'iphone'  THEN 15000
              ELSE 0
            END * o.number_of_devices
          ),0)
        - COALESCE(SUM(1500 * o.number_of_devices),0)
        - COALESCE(SUM(1000 * o.number_of_devices),0)
        AS net_profit
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.status = 'confirmed'
      GROUP BY period
      ORDER BY period DESC;
    `;
    const { rows } = await pool.query(sql);
    res.json({ message: 'Total profit report', data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/sales/marketer
 */
async function getSalesByMarketerReport(req, res, next) {
  try {
    const trunc = getTrunc(req.query.interval);
    const sql = `
      SELECT
        ${trunc}                    AS period,
        m.unique_id                 AS marketer_id,
        m.first_name || ' ' || m.last_name AS marketer_name,
        COALESCE(SUM(o.sold_amount),0) AS total_sales
      FROM orders o
      JOIN users m ON o.marketer_id = m.id
      WHERE o.status = 'released_confirmed'
      GROUP BY period, m.unique_id, marketer_name
      ORDER BY period DESC, total_sales DESC;
    `;
    const { rows } = await pool.query(sql);
    res.json({ message: 'Sales by marketer', data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/sales/admin
 */
async function getSalesByAdminReport(req, res, next) {
  try {
    const trunc = getTrunc(req.query.interval);
    const sql = `
      SELECT
        ${trunc}                    AS period,
        a.unique_id                 AS admin_id,
        a.first_name || ' ' || a.last_name   AS admin_name,
        COALESCE(SUM(o.sold_amount),0) AS total_sales
      FROM orders o
      JOIN users m ON o.marketer_id = m.id
      JOIN users a ON m.admin_id     = a.id
      WHERE o.status = 'released_confirmed'
      GROUP BY period, a.unique_id, admin_name
      ORDER BY period DESC, total_sales DESC;
    `;
    const { rows } = await pool.query(sql);
    res.json({ message: 'Sales by admin', data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/sales/superadmin
 */
async function getSalesBySuperAdminReport(req, res, next) {
  try {
    const trunc = getTrunc(req.query.interval);
    const sql = `
      SELECT
        ${trunc}                        AS period,
        su.unique_id                    AS superadmin_id,
        su.first_name || ' ' || su.last_name AS superadmin_name,
        COALESCE(SUM(o.sold_amount),0)   AS total_sales
      FROM orders o
      JOIN users m  ON o.marketer_id = m.id
      JOIN users a  ON m.admin_id     = a.id
      JOIN users su ON a.super_admin_id = su.id
      WHERE o.status = 'released_confirmed'
      GROUP BY period, su.unique_id, superadmin_name
      ORDER BY period DESC, total_sales DESC;
    `;
    const { rows } = await pool.query(sql);
    res.json({ message: 'Sales by superadmin', data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/commission/admin
 */
async function getCommissionByAdminReport(req, res, next) {
  try {
    const trunc = getTrunc(req.query.interval);
    const sql = `
      SELECT
        ${trunc}                               AS period,
        a.unique_id                            AS admin_id,
        a.first_name || ' ' || a.last_name     AS admin_name,
        COALESCE(SUM(1500 * o.number_of_devices),0) AS admin_commission
      FROM orders o
      JOIN users m ON o.marketer_id = m.id
      JOIN users a ON m.admin_id     = a.id
      WHERE o.status = 'released_confirmed'
      GROUP BY period, a.unique_id, admin_name
      ORDER BY period DESC, admin_commission DESC;
    `;
    const { rows } = await pool.query(sql);
    res.json({ message: 'Admin commission report', data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/commission/superadmin
 */
async function getCommissionBySuperAdminReport(req, res, next) {
  try {
    const trunc = getTrunc(req.query.interval);
    const sql = `
      SELECT
        ${trunc}                                 AS period,
        su.unique_id                            AS superadmin_id,
        su.first_name || ' ' || su.last_name    AS superadmin_name,
        COALESCE(SUM(1000 * o.number_of_devices),0) AS superadmin_commission
      FROM orders o
      JOIN users m  ON o.marketer_id = m.id
      JOIN users a  ON m.admin_id     = a.id
      JOIN users su ON a.super_admin_id = su.id
      WHERE o.status = 'released_confirmed'
      GROUP BY period, su.unique_id, superadmin_name
      ORDER BY period DESC, superadmin_commission DESC;
    `;
    const { rows } = await pool.query(sql);
    res.json({ message: 'SuperAdmin commission report', data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/device-sales
 */
async function getDeviceSalesReport(req, res, next) {
  try {
    const trunc = getTrunc(req.query.interval);
    const sql = `
      SELECT
        ${trunc}                             AS period,
        p.device_name,
        p.device_type,
        COALESCE(SUM(o.number_of_devices),0) AS units_sold
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.status = 'released_confirmed'
      GROUP BY period, p.device_name, p.device_type
      ORDER BY period DESC, units_sold DESC;
    `;
    const { rows } = await pool.query(sql);
    res.json({ message: 'Device sales report', data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTotalProfitReport,
  getSalesByMarketerReport,
  getSalesByAdminReport,
  getSalesBySuperAdminReport,
  getCommissionByAdminReport,
  getCommissionBySuperAdminReport,
  getDeviceSalesReport,
};
