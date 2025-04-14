// src/utils/sendSocketNotification.js
function sendSocketNotification(marketerUniqueId, message, app) {
  // Retrieve the Socket.IO instance via app
  const io = app.get("socketio");
  
  // Emit the event to the specific room identified by marketerUniqueId.
  io.to(marketerUniqueId).emit("verificationApproved", { message, marketerUniqueId });
  console.log(`Notification sent to marketer ${marketerUniqueId}: ${message}`);
}

module.exports = sendSocketNotification;
