// scripts/fixSpecificCommissions.js

require('dotenv').config();
const { pool } = require('../src/config/database');
const {
  creditAdminCommission,
  creditSuperAdminCommission
} = require('../src/services/walletService');

async function fixOrders(orderIds) {
  const client = await pool.connect();

  try {
    for (let orderId of orderIds) {
      console.log(`\n→ Fixing order ${orderId} …`);

      // 1) Read marketer_id and qty from orders
      const { rows: [order] } = await client.query(`
        SELECT marketer_id, number_of_devices AS qty
          FROM orders
         WHERE id = $1
      `, [orderId]);

      if (!order) {
        console.warn(`  • Order ${orderId} not found—skipping.`);
        continue;
      }

      const { marketer_id: marketerId, qty } = order;
      // 2) Get marketer’s unique_id
      const { rows: [mu] } = await client.query(
        `SELECT unique_id FROM users WHERE id = $1`,
        [marketerId]
      );
      if (!mu) {
        console.warn(`  • Marketer record for order ${orderId} not found—skipping.`);
        continue;
      }
      const marketerUid = mu.unique_id;

      // 3) Wrap each order in its own small transaction
      await client.query('BEGIN');

      // a) Credit Admin’s commission
      await creditAdminCommission(marketerUid, orderId, qty);

      // b) Credit SuperAdmin’s commission
      await creditSuperAdminCommission(marketerUid, orderId, qty);

      // c) Mark order as “commission_paid = TRUE”
      await client.query(`
        UPDATE orders
           SET commission_paid = TRUE
         WHERE id = $1
      `, [orderId]);

      await client.query('COMMIT');
      console.log(`  ✅ Commissions for order ${orderId} have been credited.`);
    }

    console.log('\nAll specified orders processed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error during fix:', err);
  } finally {
    client.release();
    process.exit();
  }
}

// Run the fix for exactly orders 31 and 51:
fixOrders([31, 51]);
