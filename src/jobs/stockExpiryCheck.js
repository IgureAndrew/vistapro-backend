// src/jobs/stockExpiryCheck.js
const cron       = require('node-cron');
const { pool }   = require('../config/database');
const notify     = require('../services/notificationService');  // your wrapper

// every 5min
cron.schedule('*/5 * * * *', async () => {
  // 1) find all still-pending pickups past deadline
  const { rows: expired } = await pool.query(`
    SELECT
      su.id,
      su.marketer_id,
      su.transfer_status,
      su.deadline,
      m.admin_id AS admin_id,
      a.admin_id AS superadmin_id
    FROM stock_updates su
    JOIN users m     ON m.id = su.marketer_id
    JOIN users a     ON a.id = m.admin_id
    WHERE su.transfer_status = 'none'
      AND su.status = 'pending'
      AND su.deadline < NOW()
  `);

  for (const row of expired) {
    // 2) mark as expired
    await pool.query(`
      UPDATE stock_updates
         SET status = 'expired'
       WHERE id = $1
    `, [row.id]);

    // 3) send notifications
    await notify.toUser(row.marketer_id,       `Your pickup #${row.id} has expired.`);
    await notify.toUser(row.admin_id,          `Pickup #${row.id} for your marketer has expired.`);
    await notify.toUser(row.superadmin_id,     `Pickup #${row.id} under your admin has expired.`);
  }
});
