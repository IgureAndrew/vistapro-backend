#!/usr/bin/env node
// scripts/recredit.js

// load .env so pool can read PG connection etc.
require('dotenv').config();

const { pool } = require('../src/config/database');
const svc      = require('../src/services/walletService');

;(async () => {
  try {
    // 1) Find all confirmed orders missing a 'commission' tx
    const { rows } = await pool.query(`
      SELECT
        o.id,
        o.number_of_devices,
        COALESCE(p.device_type, su_p.device_type) AS device_type,
        u.unique_id AS marketer_uid
      FROM orders o
      LEFT JOIN products p
        ON p.id = o.product_id
      LEFT JOIN stock_updates su
        ON su.id = o.stock_update_id
      LEFT JOIN products su_p
        ON su_p.id = su.product_id
      JOIN users u
        ON u.id = o.marketer_id
      WHERE o.status = 'confirmed'
        AND NOT EXISTS (
          SELECT 1
            FROM wallet_transactions wt
           WHERE wt.meta->>'orderId' = o.id::text
             AND wt.transaction_type = 'commission'
        )
    `);

    console.log(`Found ${rows.length} orders to re-credit…`);

    for (let ord of rows) {
      const { id, number_of_devices: qty, device_type, marketer_uid } = ord;
      try {
        await svc.creditMarketerCommission(
          marketer_uid,
          id,
          device_type,
          qty
        );
        console.log(`✓ Order ${id}: credited ${qty}×${device_type} to ${marketer_uid}`);
      } catch (e) {
        console.error(`✗ Order ${id} failed:`, e.message);
      }
    }
  } catch (err) {
    console.error("Script error:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
})();
