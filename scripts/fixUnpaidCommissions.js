// scripts/fixUnpaidCommissions.js

require('dotenv').config();
const { pool } = require('../src/config/database');
const {
  creditMarketerCommission,
  creditAdminCommission,
  creditSuperAdminCommission
} = require('../src/services/walletService');

async function run() {
  const client = await pool.connect();
  try {
    // 1) Fetch all released_confirmed orders still unpaid
    const { rows: orders } = await client.query(`
      SELECT id, marketer_id, product_id, number_of_devices AS qty
        FROM orders
       WHERE status = 'released_confirmed'
         AND commission_paid = FALSE
    `);

    console.log(`Found ${orders.length} unpaid orders. Processing…`);

    for (let o of orders) {
      const { id: orderId, marketer_id: marketerId, product_id: productId, qty } = o;

      // wrap each order in its own transaction to avoid partial failures
      await client.query('BEGIN');

      // a) fetch marketer unique_id
      const { rows: [mu] } = await client.query(
        `SELECT unique_id FROM users WHERE id = $1`,
        [marketerId]
      );
      const marketerUid = mu.unique_id;

      // b) fetch device_type
      const { rows: [pd] } = await client.query(
        `SELECT device_type FROM products WHERE id = $1`,
        [productId]
      );
      const deviceType = pd.device_type;

      // c) credit all three commissions
      await creditMarketerCommission(marketerUid, orderId, deviceType, qty);
      await creditAdminCommission    (marketerUid, orderId,           qty);
      await creditSuperAdminCommission(marketerUid, orderId,          qty);

      // d) mark this order as paid
      await client.query(
        `UPDATE orders SET commission_paid = TRUE WHERE id = $1`,
        [orderId]
      );

      await client.query('COMMIT');
      console.log(`✅ Order ${orderId} paid out.`);
    }

    console.log('All done!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error processing commissions:', err);
  } finally {
    client.release();
    process.exit();
  }
}

run();
