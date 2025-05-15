async function getStats(from, to) {
  const sql = `
    SELECT
      -- total number of orders in the range
      COUNT(DISTINCT o.id) AS total_orders,

      -- total devices sold (all types)
      SUM(o.number_of_devices) AS total_devices_sold,

      -- how many android devices
      SUM(
        CASE WHEN p.device_type = 'android'
             THEN o.number_of_devices
             ELSE 0
        END
      ) AS android_sold,

      -- how many ios devices
      SUM(
        CASE WHEN p.device_type = 'ios'
             THEN o.number_of_devices
             ELSE 0
        END
      ) AS ios_sold,

      -- expected gross profit (sum of (sell_price - cost_price) * qty )
      SUM( (p.selling_price - p.cost_price) * o.number_of_devices )::int
        AS gross_profit,

      -- total commission expenses per device:
      -- android: ₦10,000 to marketer + ₦1,500 to admin + ₦1,000 to super = 12,500
      -- ios:     ₦15,000 + ₦1,500 + ₦1,000 = 17,500
      SUM(
        CASE WHEN p.device_type = 'android'
             THEN o.number_of_devices * 12500
             WHEN p.device_type = 'ios'
             THEN o.number_of_devices * 17500
             ELSE 0
        END
      )::int AS total_commission_expense,

      -- net profit after paying all commissions
      ( SUM((p.selling_price - p.cost_price) * o.number_of_devices)
        - SUM(
            CASE WHEN p.device_type = 'android'
                 THEN o.number_of_devices * 12500
                 WHEN p.device_type = 'ios'
                 THEN o.number_of_devices * 17500
                 ELSE 0
            END
          )
      )::int AS net_profit

    FROM orders o
    JOIN products p
      ON p.id = o.product_id
    WHERE o.status = 'confirmed'
      AND o.created_at BETWEEN $1 AND $2
  `;

  const { rows: [stats] } = await pool.query(sql, [from, to]);
  return {
    totalOrders:            Number(stats.total_orders),
    totalDevicesSold:       Number(stats.total_devices_sold),
    androidSold:            Number(stats.android_sold),
    iosSold:                Number(stats.ios_sold),
    grossProfit:            Number(stats.gross_profit),
    totalCommissionExpense: Number(stats.total_commission_expense),
    netProfit:              Number(stats.net_profit),
  };
}
