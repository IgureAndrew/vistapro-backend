// src/utils/logActivity.js
const { pool } = require("../config/database");

async function logActivity({ actorId, actorName, activityType, entityType, entityUniqueId }) {
  return pool.query(
    `INSERT INTO activity_logs
      (actor_id, actor_name, activity_type, entity_type, entity_unique_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [ actorId, actorName, activityType, entityType, entityUniqueId ]
  );
}

module.exports = logActivity;
