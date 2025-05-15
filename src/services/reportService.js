const { pool } = require('../config/database');

const COMMISSION = {
  marketer:  { android: 10000, ios: 15000 },
  admin:     1500,
  superAdmin:1000
};

async function getStats(from, to) {
  // 1) expected profit on inventory:
  const { rows: inv } = await pool.query(`
    SELECT 
      COALESCE(SUM((selling_price - cost_price) * quantity),0)::int 
      AS expected_profit
    FROM products
  `);
  const expectedProfit = inv[0].expected_profit;

  // 2) daily breakdown of confirmed orders:
  const { rows: daily } = await pool.query(`
    SELECT
      DATE(o.created_at) AS date,
      COUNT(*) FILTER (WHERE o.device_type='android') AS soldAndroid,
      COUNT(*) FILTER (WHERE o.device_type='ios')     AS soldIos,
      -- profit before expenses:
      SUM((o.selling_price - o.cost_price))::int
        FILTER (WHERE o.status='confirmed')          AS profitBefore,
      -- total commissions paid (expenses):
      (
        COUNT(*) FILTER (WHERE o.device_type='android') * ($3 + $4 + $5)
        + COUNT(*) FILTER (WHERE o.device_type='ios') * ($6 + $4 + $5)
      )::int                                          AS expenses
    FROM orders o
    WHERE o.status = 'confirmed'
      AND ($1 IS NULL OR o.created_at::date >= $1)
      AND ($2 IS NULL OR o.created_at::date <= $2)
    GROUP BY DATE(o.created_at)
    ORDER BY DATE(o.created_at)
  `, [
    from || null,
    to   || null,
    COMMISSION.marketer.android,
    COMMISSION.admin,
    COMMISSION.superAdmin,
    COMMISSION.marketer.ios,
  ]);

  // 3) compute totals across all days:
  const totalExpenses = daily.reduce((s,r)=> s + r.expenses, 0);
  const totalBefore   = daily.reduce((s,r)=> s + r.profitbefore, 0);
  const netProfit     = totalBefore - totalExpenses;

  return {
    expectedProfit,
    expenses: totalExpenses,
    netProfit,
    daily: daily.map(r => ({
      date:           r.date,
      soldAndroid:    r.soldandroid,
      soldIos:        r.soldios,
      profitAndroid:  COMMISSION.marketer.android  * r.soldandroid,
      profitIos:      COMMISSION.marketer.ios      * r.soldios,
      expenseAndroid: (COMMISSION.marketer.android + COMMISSION.admin + COMMISSION.superAdmin) * r.soldandroid,
      expenseIos:     (COMMISSION.marketer.ios     + COMMISSION.admin + COMMISSION.superAdmin) * r.soldios,
      netProfit:      ( (COMMISSION.marketer.android * r.soldandroid)
                      + (COMMISSION.marketer.ios     * r.soldios))
                     - r.expenses
    }))
  };
}

module.exports = { getStats };
