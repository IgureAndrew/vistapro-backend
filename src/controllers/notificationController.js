const { pool } = require('../config/database');

// GET /api/notifications
exports.listNotifications = async (req, res, next) => {
  try {
    const userId = req.user.unique_id;
    const { rows } = await pool.query(
      `SELECT id, message, is_read, created_at
       FROM notifications
       WHERE user_unique_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );
    // also return an unread count:
    const countRes = await pool.query(
      `SELECT COUNT(*) AS unread
       FROM notifications
       WHERE user_unique_id = $1 AND NOT is_read`,
      [userId]
    );
    res.json({ notifications: rows, unread: +countRes.rows[0].unread });
  } catch (err) { next(err); }
};

// PATCH /api/notifications/:id/read
exports.markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.unique_id;
    const notifId = req.params.id;
    const { rowCount } = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_unique_id = $2`,
      [notifId, userId]
    );
    if (!rowCount) return res.status(404).json({ message: 'Not found.' });
    res.sendStatus(204);
  } catch (err) { next(err); }
};
