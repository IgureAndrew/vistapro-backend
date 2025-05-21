// src/utils/sendSocketNotification.js
const { pool } = require("../config/database");

async function sendSocketNotification(marketerUniqueId, message, app) {
  // 1) Grab your io instance
  const io = app.get("socketio");
  if (!io) {
    console.warn("⚠️  Socket.IO instance not found on app");
    return;
  }

  // 2) Persist the notification
  const insertRes = await pool.query(
    `INSERT INTO notifications (user_unique_id, message, created_at)
     VALUES ($1, $2, NOW())
     RETURNING id, created_at`,
    [marketerUniqueId, message]
  );
  const { id, created_at } = insertRes.rows[0];

  // 3) Recompute unread count
  const countRes = await pool.query(
    `SELECT COUNT(*) AS unread
     FROM notifications
     WHERE user_unique_id = $1 AND NOT is_read`,
    [marketerUniqueId]
  );
  const unreadCount = Number(countRes.rows[0].unread);

  // 4) Emit the new notification for the dropdown
  io.to(marketerUniqueId).emit("newNotification", {
    id,
    message,
    created_at,
    is_read: false
  });

  // 5) Emit the updated badge count
  io.to(marketerUniqueId).emit("notificationCount", { count: unreadCount });

  // 6) If it’s an approval flow, also emit verificationApproved
  if (message.toLowerCase().includes("approved")) {
    io.to(marketerUniqueId).emit("verificationApproved", {
      marketerUniqueId,
      message
    });
  }

  console.log(
    `🔔 [${marketerUniqueId}] Sent notification: "${message}" (unread=${unreadCount})`
  );
}

module.exports = sendSocketNotification;
