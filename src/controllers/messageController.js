// src/controllers/messageController.js
const { pool } = require('../config/database')

async function listContacts(req, res, next) {
  const me = req.user    // { id, unique_id, role, admin_id, super_admin_id, … }

  try {
    let rows

    switch (me.role) {
      case 'Marketer':
        // marketers under same admin + their admin
        rows = (await pool.query(`
          SELECT unique_id, first_name, last_name, role
            FROM users
           WHERE (admin_id = $1 AND role = 'Marketer')
              OR unique_id = (
                   SELECT unique_id FROM users WHERE id = $1
                 )
        `, [me.id])).rows
        break

      case 'Admin':
        // your marketers + your superadmin
        rows = (await pool.query(`
          SELECT unique_id, first_name, last_name, role
            FROM users
           WHERE (admin_id = $1 AND role = 'Marketer')
              OR unique_id = (
                   SELECT unique_id FROM users WHERE id = (
                     SELECT super_admin_id FROM users WHERE id = $1
                   )
                 )
        `, [me.id])).rows
        break

      case 'SuperAdmin':
        // all admins under you + master admin
        rows = (await pool.query(`
          SELECT unique_id, first_name, last_name, role
            FROM users
           WHERE role = 'Admin' AND super_admin_id = $1
              OR role = 'MasterAdmin'
        `, [me.id])).rows
        break

      case 'MasterAdmin':
        // everyone
        rows = (await pool.query(`
          SELECT unique_id, first_name, last_name, role
            FROM users
        `)).rows
        break

      default:
        rows = []
    }

    res.json(rows)
  } catch (err) {
    next(err)
  }
}

async function getThread(req, res, next) {
  const me = req.user.unique_id
  const them = req.params.with

  try {
    const { rows } = await pool.query(`
      SELECT sender, recipient, message, created_at
        FROM messages
       WHERE (sender = $1 AND recipient = $2)
          OR (sender = $2 AND recipient = $1)
       ORDER BY created_at
    `, [me, them])

    res.json(rows)
  } catch (err) { next(err) }
}

async function sendMessage(req, res, next) {
  const me   = req.user.unique_id
  const them = req.params.with
  const { text } = req.body

  try {
    await pool.query(`
      INSERT INTO messages (sender, recipient, message, created_at)
      VALUES ($1,$2,$3,NOW())
    `, [me, them, text])

    // optionally: emit a Socket.io event here…

    res.sendStatus(201)
  } catch (err) { next(err) }
}

module.exports = {
  listContacts,
  getThread,
  sendMessage
}
