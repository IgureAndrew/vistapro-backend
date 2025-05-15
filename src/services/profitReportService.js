const { pool } = require('../config/database');

/**
 * Returns:
 *  - expectedInventoryProfit: total profit if you sold all current stock
 *  - breakdown: per-day, per-product sales/profit/expense/net
 *  - totals: roll-up of gross, expense, net
 *  - goalProgress: percent realized vs. expected
 */
async function getProfitReport(from, to) {
  // 1) Expected profit on all inventory
  const invSql = `
    SELECT
      COALESCE(SUM((selling_price - cost_price) * quantity), 0)::int
      AS expected_inventory_profit
    FROM products;
  `;
  const { rows: [inv] } = await pool.query(invSql);

  // 2) Daily sales/profit/expense breakdown
  const salesSql = `
    WITH sold AS (
      SELECT
        DATE(o.confirmed_at)         AS sale_date,
        p.id                         AS product_id,
        p.device_name,
        p.device_type,
        oi.quantity,
        (p.selling_price - p.cost_price) * oi.quantity
          AS gross_profit,
        CASE
          WHEN p.device_type = 'android' THEN 12500 * oi.quantity
          WHEN p.device_type = 'ios'     THEN 17500 * oi.quantity
          ELSE 0
        END                           AS commission_expense
      FROM orders o
      JOIN order_items oi  ON oi.order_id = o.id
      JOIN products p     ON p.id        = oi.product_id
      WHERE
        o.status = 'confirmed'
        AND o.confirmed_at BETWEEN $1 AND $2
    )
    SELECT
      sale_date,
      product_id,
      device_name,
      device_type,
      SUM(quantity)              AS total_qty,
      SUM(gross_profit)::int     AS gross_profit,
      SUM(commission_expense)::int AS commission_expense,
      (SUM(gross_profit) - SUM(commission_expense))::int
        AS net_profit
    FROM sold
    GROUP BY sale_date, product_id, device_name, device_type
    ORDER BY sale_date, product_id;
  `;
  const { rows: breakdown } = await pool.query(salesSql, [from, to]);

  // 3) Totals roll-up
  const totals = breakdown.reduce((t, r) => {
    t.gross_profit     += r.gross_profit;
    t.commission_expense += r.commission_expense;
    t.net_profit       += r.net_profit;
    return t;
  }, { gross_profit:0, commission_expense:0, net_profit:0 });

  // 4) Progress vs. goal
  const goalProgress = inv.expected_inventory_profit
    ? Math.round((totals.net_profit / inv.expected_inventory_profit) * 100)
    : 0;

  return {
    expectedInventoryProfit: Number(inv.expected_inventory_profit),
    breakdown,
    totals,
    goalProgress
  };
}

module.exports = { getProfitReport };
