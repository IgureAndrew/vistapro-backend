// src/utils/sendSocketNotification.js
const { pool } = require("../config/database");

async function sendSocketNotification(marketerUniqueId, message, app) {
  const io = app.get("socketio");
  if (!io) {
    console.warn("Socket.IO instance not found on app");
    return;
  }

  // 1) Persist notification in the database
  const insertRes = await pool.query(
    `INSERT INTO notifications (user_unique_id, message, created_at)
     VALUES ($1, $2, NOW())
     RETURNING id, created_at`,
    [marketerUniqueId, message]
  );
  const notif = insertRes.rows[0];

  // 2) Re‑compute unread count
  const countRes = await pool.query(
    `SELECT COUNT(*) AS unread
     FROM notifications
     WHERE user_unique_id = $1 AND NOT is_read`,
    [marketerUniqueId]
  );
  const unreadCount = Number(countRes.rows[0].unread);

  // 3) Emit the “newNotification” payload (for your bell dropdown)
  io.to(marketerUniqueId).emit("newNotification", {
    id: notif.id,
    message,
    created_at: notif.created_at,
    is_read: false
  });

  // 4) Emit the updated badge count
  io.to(marketerUniqueId).emit("notificationCount", { count: unreadCount });

  // 5) If this is a “verificationApproved” flow, still fire that too
  //    (so your dashboard‑locked → unlocked alert still works)
  if (message.toLowerCase().includes("approved")) {
    io.to(marketerUniqueId).emit("verificationApproved", {
      message,
      marketerUniqueId,
    });
  }

  console.log(
    `🔔 Sent notification to ${marketerUniqueId}: "${message}" (unread=${unreadCount})`
  );
}

module.exports = sendSocketNotification;
