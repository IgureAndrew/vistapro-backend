const cron = require("node-cron");
const { pool } = require("../config/database");

// every 15min check for expired pickups and notify
cron.schedule("*/15 * * * *", async () => {
  const client = await pool.connect();
  try {
    // 1) find pickups past deadline, still pending, not yet notified
    const { rows } = await client.query(`
      SELECT 
        su.id,
        su.deadline,
        p.device_name,
        p.device_model,
        m.unique_id       AS marketer_uid,
        a2.unique_id      AS admin_uid,
        sa.unique_id      AS superadmin_uid
      FROM stock_updates su
      JOIN products p ON p.id = su.product_id
      JOIN users m    ON m.id = su.marketer_id
      LEFT JOIN users a ON m.admin_id = a.id
      LEFT JOIN users a2 ON a.id = a2.id
      LEFT JOIN users sa ON a2.super_admin_id = sa.id
      WHERE su.status = 'pending'
        AND su.deadline < NOW()
        AND NOT su.expiry_notified
    `);

    for (const r of rows) {
      const msg = 
        `Your stock‐pickup #${r.id} (${r.device_name} ${r.device_model}) ` +
        `expired on ${r.deadline.toISOString()}`;

      // notify marketer, their admin, and superadmin (if present)
      const targets = [r.marketer_uid, r.admin_uid, r.superadmin_uid]
        .filter(u => !!u);
      for (const uid of targets) {
        await client.query(
          `INSERT INTO notifications (user_unique_id, message, created_at)
           VALUES ($1, $2, NOW())`,
          [uid, msg]
        );
      }

      // mark notified
      await client.query(
        `UPDATE stock_updates
           SET expiry_notified = TRUE
         WHERE id = $1`,
        [r.id]
      );
    }
  } catch (e) {
    console.error("Expiry notifier failed:", e);
  } finally {
    client.release();
  }
});
