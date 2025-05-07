// src/jobs/expireStockPickups.js
const cron = require('node-cron');
const { pool } = require('../config/database');

// Run every minute
cron.schedule('* * * * *', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Find all pending pickups whose deadline is past
    const { rows: expired } = await client.query(`
      SELECT id, marketer_id
        FROM stock_updates
       WHERE status = 'pending'
         AND deadline < NOW()
    `);

    if (expired.length === 0) {
      await client.query('COMMIT');
      return;
    }

    const expiredIds = expired.map(r => r.id);

    // 2) Mark them expired
    await client.query(`
      UPDATE stock_updates
         SET status     = 'expired',
             expired_at = NOW(),
             updated_at = NOW()
       WHERE id = ANY($1)
    `, [expiredIds]);

    // 3) Notify MasterAdmin, Admin, SuperAdmin for each
    for (const { id: suId, marketer_id } of expired) {
      // a) MasterAdmin
      await client.query(`
        INSERT INTO notifications (user_unique_id, message, created_at)
        SELECT unique_id, $2, NOW()
          FROM users
         WHERE role = 'MasterAdmin'
      `, [
        suId,
        `Stock‐pickup #${suId} has expired (48 h lapsed without sale/transfer/return).`
      ]);

      // b) The Admin of that marketer
      const { rows: adminRows } = await client.query(`
        SELECT u2.unique_id
          FROM users u1
          JOIN users u2 ON u1.admin_id = u2.id
         WHERE u1.id = $1
      `, [marketer_id]);
      if (adminRows[0]) {
        await client.query(`
          INSERT INTO notifications (user_unique_id, message, created_at)
          VALUES ($1, $2, NOW())
        `, [
          adminRows[0].unique_id,
          `Your marketer’s stock‐pickup #${suId} has expired.`
        ]);
      }

      // c) That Admin’s SuperAdmin
      const { rows: superRows } = await client.query(`
        SELECT u3.unique_id
          FROM users u2
          JOIN users u3 ON u2.super_admin_id = u3.id
         WHERE u2.id = (
           SELECT admin_id FROM users WHERE id = $1
         )
      `, [marketer_id]);
      if (superRows[0]) {
        await client.query(`
          INSERT INTO notifications (user_unique_id, message, created_at)
          VALUES ($1, $2, NOW())
        `, [
          superRows[0].unique_id,
          `A stock‐pickup in your chain (#${suId}) has expired.`
        ]);
      }
    }

    await client.query('COMMIT');
    console.log(`🕑 Marked pickups expired: ${expiredIds.join(', ')}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error expiring pickups:", err);
  } finally {
    client.release();
  }
});
