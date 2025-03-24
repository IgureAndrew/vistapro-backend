// src/utils/auditLogger.js
const { pool } = require('../config/database');

/**
 * logAudit - Logs an audit trail into the audit_logs table.
 * @param {number} userId - ID of the user performing the action.
 * @param {string} action - A short description of the action (e.g., 'USER_DELETED').
 * @param {string} description - Detailed information about the action.
 */
const logAudit = async (userId, action, description) => {
  try {
    const query = `
      INSERT INTO audit_logs (user_id, action, description, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *;
    `;
    const values = [userId, action, description];
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    // Log error to console but do not crash the app if audit logging fails.
    console.error('Audit logging error:', error);
  }
};

module.exports = { logAudit };
