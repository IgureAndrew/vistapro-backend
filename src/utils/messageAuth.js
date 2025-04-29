const { pool } = require('../config/database');

/**
 * Returns true if `from` is allowed to message `to` under your rules.
 */
async function canMessage(fromUid, toUid) {
  if (fromUid === toUid) return true;  // always can message self if you like

  // fetch both users
  const { rows: [from] } = await pool.query(
    `SELECT unique_id, role, admin_id, super_admin_id 
       FROM users WHERE unique_id = $1`, [fromUid]
  );
  const { rows: [to] } = await pool.query(
    `SELECT unique_id, role, admin_id, super_admin_id 
       FROM users WHERE unique_id = $1`, [toUid]
  );
  if (!from || !to) return false;

  // MASTER ADMIN can message anybody
  if (from.role === 'MasterAdmin') return true;

  // SUPERADMIN -> only to MasterAdmin
  if (from.role === 'SuperAdmin') {
    return to.role === 'MasterAdmin';
  }

  // ADMIN -> to:
  //   • assigned SuperAdmin
  //   • any of its own marketers
  if (from.role === 'Admin') {
    // to your superadmin?
    if (to.role === 'SuperAdmin' && from.super_admin_id === to.id) {
      return true;
    }
    // to your marketers?
    if (to.role === 'Marketer' && to.admin_id === from.id) {
      return true;
    }
    return false;
  }

  // MARKETER -> to:
  //   • its Admin
  //   • other marketers under same Admin
  if (from.role === 'Marketer') {
    // fetch your own admin_id
    const yourAdmin = from.admin_id;
    if (to.role === 'Admin' && to.id === yourAdmin) {
      return true;
    }
    if (to.role === 'Marketer' && to.admin_id === yourAdmin) {
      return true;
    }
    return false;
  }

  // default deny
  return false;
}

module.exports = { canMessage };
