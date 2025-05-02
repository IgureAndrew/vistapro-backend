// utils/logActivity.js
const { pool } = require('../config/database');
module.exports = async function logActivity(actorId, actorName, activityType, entityType, entityUniqueId) {
  await pool.query(
    `INSERT INTO activity_logs
       (actor_id, actor_name, activity_type, entity_type, entity_unique_id, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [actorId, actorName, activityType, entityType, entityUniqueId]
  );
};
