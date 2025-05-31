// scripts/fixSelectedCommissions.js

/**
 * This script only targets the orders: 271, 272, 273, 274
 * It re‐runs your commission helpers to insert any missing wallet_transactions,
 * marks commission_paid = TRUE for each if it was FALSE, and inserts a sales_record.
 */

require('dotenv').config();
const { pool } = require('../src/config/database');
const {
  creditMarketerCommission,
  creditAdminCommission,
  creditSuperAdminCommission
} = require('../src/services/walletService');

async function run() {
  const client = await pool.connect();

  // ◼︎ List here the exact order IDs you want to fix:
  const orderIdsToFix = [271, 272, 273, 274];

  try {
    console.log(`\n🚀 Starting to fix commissions for orders: ${orderIdsToFix.join(', ')}\n`);

    for (let orderId of orderIdsToFix) {
      // Start a transaction per‐order (to keep things isolated)
      await client.query('BEGIN');

      // 1) Re‐fetch the order’s core details (under FOR UPDATE lock)
      const { rows: [ordRow] } = await client.query(
        `
        SELECT
          marketer_id,
          number_of_devices AS qty,
          stock_update_id,
          commission_paid
        FROM orders
        WHERE id = $1
          AND status = 'released_confirmed'
        FOR UPDATE
        `,
        [orderId]
      );

      if (!ordRow) {
        console.warn(`⚠️  Order ${orderId} not found, or not “released_confirmed.” Skipping.\n`);
        await client.query('ROLLBACK');
        continue;
      }

      const {
        marketer_id:    marketerId,
        qty,
        stock_update_id: stockUpdateId,
        commission_paid: commissionPaid
      } = ordRow;

      // 2) Lookup marketer’s unique_id
      const { rows: [mu] } = await client.query(
        `SELECT unique_id FROM users WHERE id = $1`,
        [marketerId]
      );
      if (!mu) {
        console.warn(`⚠️  Order ${orderId}: marketer with ID=${marketerId} not found in users. Skipping.\n`);
        await client.query('ROLLBACK');
        continue;
      }
      const marketerUid = mu.unique_id;

      // 3) Determine device_type via product or stock_update
      const { rows: [pd] } = await client.query(
        `
        SELECT device_type
        FROM products
        WHERE id = (
          SELECT COALESCE(product_id,
                          (SELECT product_id FROM stock_updates WHERE id = o.stock_update_id))
          FROM orders o
          WHERE o.id = $1
        )
        `,
        [orderId]
      );
      if (!pd) {
        console.warn(`⚠️  Order ${orderId}: cannot resolve device_type. Skipping.\n`);
        await client.query('ROLLBACK');
        continue;
      }
      const deviceType = pd.device_type;

      console.log(`→ Processing Order ${orderId} (marketer=${marketerUid}, qty=${qty}, deviceType=${deviceType})`);

      // 4) Re‐run each commission helper.
      //    Because each helper is written with an ON CONFLICT DO NOTHING,
      //    it will insert only the missing wallet_transactions rows.
      await creditMarketerCommission(marketerUid, orderId, deviceType, qty);
      await creditAdminCommission(marketerUid, orderId, qty);
      await creditSuperAdminCommission(marketerUid, orderId, qty);

      // 5) If commission_paid was still FALSE, we need to flip it to TRUE
      //    and insert a sales_record (guarded by ON CONFLICT on order_id if you have one).
      if (!commissionPaid) {
        console.log(`   • Marking commission_paid = TRUE for Order ${orderId}`);
        await client.query(
          `UPDATE orders
             SET commission_paid = TRUE
           WHERE id = $1
          `,
          [orderId]
        );

        // 5a) Compute initial_profit
        //     (We reuse the same logic: (selling_price - cost_price) * qty)
        const { rows: [profitRow] } = await client.query(
          `
          SELECT (selling_price - cost_price) * $1 AS profit
          FROM products
          WHERE id = (
            SELECT COALESCE(product_id,
                            (SELECT product_id FROM stock_updates WHERE id = o.stock_update_id))
            FROM orders o
            WHERE o.id = $2
          )
          `,
          [qty, orderId]
        );
        const initialProfit = profitRow?.profit || 0;

        // 5b) Insert into sales_record, but skip if already exists:
        //     (Assumes you have a unique constraint on sales_record(order_id); if not, simply insert.)
        await client.query(
          `
          INSERT INTO sales_record
            (order_id, product_id, sale_date, quantity_sold, initial_profit)
          VALUES
            (
              $1,
              (SELECT COALESCE(product_id,
                               (SELECT product_id FROM stock_updates WHERE id = o.stock_update_id))
               FROM orders o WHERE o.id = $1),
              NOW(),
              $2,
              $3
            )
          ON CONFLICT (order_id) DO NOTHING
          `,
          [orderId, qty, initialProfit]
        );

        console.log(`   • Inserted sales_record (profit=${initialProfit}); set commission_paid=TRUE.\n`);
      } else {
        console.log(`   • commission_paid was already TRUE; skipping sales_record.\n`);
      }

      await client.query('COMMIT');
    }

    console.log('✅ Done fixing all specified orders.\n');
  } catch (err) {
    console.error('❌ Fatal error in fixSelectedCommissions.js:', err);
    try { await client.query('ROLLBACK'); } catch (_) {}
  } finally {
    client.release();
    process.exit(0);
  }
}

run()