// src/utils/notifications.js
const { getIo } = require('../socket');

/**
 * Sends a real-time socket notification to a specific user.
 * @param {string} userId - The unique identifier of the user (typically the same as used when joining a room).
 * @param {string} message - The message to send.
 */
const sendSocketNotification = (userId, message) => {
  try {
    const io = getIo();
    // Emit a notification event to the specific user's room.
    io.to(userId).emit('notification', { message });
    console.log(`Notification sent to ${userId}: ${message}`);
  } catch (error) {
    console.error("Error sending socket notification:", error);
  }
};

module.exports = { sendSocketNotification };
