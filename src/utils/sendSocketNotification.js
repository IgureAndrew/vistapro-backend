// src/utils/sendSocketNotification.js
function sendSocketNotification(marketerUniqueId, message, app) {
  // Retrieve the Socket.IO instance from the Express app.
  const io = app.get("socketio");

  // Emit the 'verificationApproved' event to the room for the specific marketer.
  io.to(marketerUniqueId).emit("verificationApproved", { message, marketerUniqueId });
  console.log(`Notification sent to marketer ${marketerUniqueId}: ${message}`);
}

module.exports = sendSocketNotification;
