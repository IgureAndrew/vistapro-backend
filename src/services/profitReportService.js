const { pool } = require('../config/database');

async function getProfitReport(from, to) {
  // 1) Expected inventory profit (unchanged)
  const invSql = `
    SELECT
      COALESCE(SUM((selling_price - cost_price) * quantity), 0) AS expected_profit
    FROM products;
  `;
  const { rows: [inv] } = await pool.query(invSql);
  const expectedInventoryProfit = Number(inv.expected_profit);

  // 2) Sales breakdown using confirmed_at instead of sale_date
  const salesSql = `
    SELECT
      DATE(o.confirmed_at)                                                         AS sale_date,
      p.device_name,
      p.device_type,
      SUM(o.number_of_devices)                                                     AS total_qty,
      SUM(p.profit * o.number_of_devices)                                          AS gross_profit,
      SUM(
        CASE
          WHEN p.device_type = 'android' THEN 12500 * o.number_of_devices
          WHEN p.device_type = 'ios'     THEN 17500 * o.number_of_devices
          ELSE 0
        END
      )                                                                             AS commission_expense,
      SUM(
        (p.profit * o.number_of_devices)
        - CASE
            WHEN p.device_type = 'android' THEN 12500 * o.number_of_devices
            WHEN p.device_type = 'ios'     THEN 17500 * o.number_of_devices
            ELSE 0
          END
      )                                                                             AS net_profit
    FROM orders o
    JOIN products p ON o.product_id = p.id
    WHERE o.status = 'confirmed'
      AND o.confirmed_at BETWEEN $1 AND $2
    GROUP BY 1,2,3
    ORDER BY 1,2;
  `;
  const { rows: breakdown } = await pool.query(salesSql, [from, to]);

  // 3) Totals
  let gross = 0, expense = 0, net = 0;
  breakdown.forEach(r => {
    gross   += Number(r.gross_profit);
    expense += Number(r.commission_expense);
    net     += Number(r.net_profit);
  });

  // 4) Goal progress
  const goalProgress = expectedInventoryProfit
    ? Math.min(100, Math.round((gross / expectedInventoryProfit) * 100))
    : 0;

  // 5) Return payload
  return {
    expectedInventoryProfit,
    goalProgress,
    totals: {
      gross_profit:       gross,
      commission_expense: expense,
      net_profit:         net
    },
    breakdown: breakdown.map(r => ({
      sale_date:          r.sale_date.toISOString().slice(0,10),
      device_name:        r.device_name,
      device_type:        r.device_type,
      total_qty:          Number(r.total_qty),
      gross_profit:       Number(r.gross_profit),
      commission_expense: Number(r.commission_expense),
      net_profit:         Number(r.net_profit),
    }))
  };
}

module.exports = { getProfitReport };
