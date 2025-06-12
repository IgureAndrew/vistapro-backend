const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');
const { logAudit } = require('../utils/auditLogger'); // Optional: for audit trails

/**
 * GET /api/super-admin/account
 * Fetch current super-admin’s profile settings
 */
async function getAccountSettings(req, res, next) {
  try {
    const superUid = req.user.unique_id;
    if (!superUid) {
      return res.status(400).json({ message: "SuperAdmin unique ID not available." });
    }
    const { rows } = await pool.query(`
      SELECT
        first_name        AS firstName,
        last_name         AS lastName,
        email,
        phone,
        profile_image     AS profileImage
      FROM users
      WHERE unique_id = $1
        AND role = 'SuperAdmin'
    `, [superUid]);

    if (!rows.length) {
      return res.status(404).json({ message: "SuperAdmin not found." });
    }
    res.json({ settings: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/super-admin/account
 * Partially update super-admin’s profile
 */
async function updateAccountSettings(req, res, next) {
  try {
    const superUid = req.user.unique_id;
    if (!superUid) {
      return res.status(400).json({ message: "SuperAdmin unique ID not available." });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      oldPassword,
      newPassword
    } = req.body;

    const clauses = [];
    const values  = [];
    let   idx     = 1;

    // 1) handle password change
    if (newPassword) {
      if (!oldPassword) {
        return res.status(400).json({ message: "Old password is required to change password." });
      }
      // fetch existing hash
      const { rows: urows } = await pool.query(
        `SELECT password FROM users WHERE unique_id = $1 AND role = 'SuperAdmin'`,
        [superUid]
      );
      if (!urows.length) {
        return res.status(404).json({ message: "SuperAdmin not found." });
      }
      const match = await bcrypt.compare(oldPassword, urows[0].password);
      if (!match) {
        return res.status(400).json({ message: "Old password is incorrect." });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      clauses.push(`password = $${idx}`); values.push(hash); idx++;
    }

    // 2) other optional fields
    if (firstName) {
      clauses.push(`first_name = $${idx}`); values.push(firstName); idx++;
    }
    if (lastName) {
      clauses.push(`last_name = $${idx}`); values.push(lastName); idx++;
    }
    if (email) {
      clauses.push(`email = $${idx}`); values.push(email); idx++;
    }
    if (phone) {
      clauses.push(`phone = $${idx}`); values.push(phone); idx++;
    }
    if (req.file) {
      clauses.push(`profile_image = $${idx}`); values.push(req.file.path); idx++;
    }

    if (!clauses.length) {
      return res.status(400).json({ message: "No fields provided for update." });
    }

    // always update updated_at
    clauses.push(`updated_at = NOW()`);

    // add WHERE param
    values.push(superUid);

    const sql = `
      UPDATE users
         SET ${clauses.join(', ')}
       WHERE unique_id = $${idx}
         AND role = 'SuperAdmin'
      RETURNING
        unique_id        AS uniqueId,
        first_name       AS firstName,
        last_name        AS lastName,
        email,
        phone,
        profile_image    AS profileImage,
        updated_at       AS updatedAt
    `;

    const { rows } = await pool.query(sql, values);
    if (!rows.length) {
      return res.status(404).json({ message: "SuperAdmin not found." });
    }
    res.json({
      message: "Account updated successfully.",
      settings: rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * registerAdmin - Allows Super Admins to register a new Admin account.
 * Expects name, email, password, phone, and account_number in req.body.
 */
const registerAdmin = async (req, res, next) => {
  try {
    const { name, email, password, phone, account_number } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newAdmin = await createUser({
      name,
      email,
      password: hashedPassword,
      role: 'Admin',
      phone,
      account_number,
    });

    // Optional: Log this action in audit logs
    await logAudit(req.user.id, 'REGISTER_ADMIN', `Super Admin registered Admin with email: ${email}`);

    return res.status(201).json({
      message: 'Admin registered successfully. Login details have been sent to the email.',
      admin: newAdmin,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * GET /api/super-admin/hierarchy
 * Returns this SuperAdmin’s Admins and, for each Admin, their assigned Marketers.
 */
async function listHierarchy(req, res, next) {
  try {
    // ensure only SuperAdmins can hit this
    if (req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const superUid = req.user.unique_id;
    // grab their internal numeric ID
    const { rows: saRows } = await pool.query(
      `SELECT id FROM users WHERE unique_id = $1 AND role = 'SuperAdmin'`,
      [superUid]
    );
    if (!saRows.length) {
      return res.status(404).json({ message: 'SuperAdmin not found.' });
    }
    const superId = saRows[0].id;

    const sql = `
      SELECT
        a.unique_id           AS "adminUniqueId",
        a.first_name          AS "firstName",
        a.last_name           AS "lastName",
        a.email,
        COALESCE(m.marketers, '[]') AS "marketers"
      FROM users a
      LEFT JOIN (
        SELECT
          admin_id,
          json_agg(
            json_build_object(
              'uniqueId', u.unique_id,
              'firstName', u.first_name,
              'lastName', u.last_name,
              'email', u.email
            )
          ) AS marketers
        FROM users u
        WHERE u.role = 'Marketer'
        GROUP BY u.admin_id
      ) m ON m.admin_id = a.id
      WHERE a.role = 'Admin'
        AND a.super_admin_id = $1
      ORDER BY a.first_name, a.last_name
    `;

    const { rows } = await pool.query(sql, [superId]);
    res.json({ admins: rows });

  } catch (err) {
    next(err);
  }
}

async function getOrderHistoryForSuperAdmin(req, res, next) {
  try {
    if (req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const superUid = req.user.unique_id;
    const { rows: saRows } = await pool.query(
      `SELECT id FROM users WHERE unique_id = $1 AND role = 'SuperAdmin'`,
      [superUid]
    );
    if (!saRows.length) {
      return res.status(404).json({ message: 'SuperAdmin not found.' });
    }
    const superId = saRows[0].id;

    const { rows } = await pool.query(`
      SELECT
        o.id                                    AS "id",
        o.bnpl_platform                        AS "bnplPlatform",
        o.number_of_devices                    AS "qty",
        o.sold_amount                          AS "soldAmount",
        o.sale_date                            AS "saleDate",
        o.status                               AS "status",

        -- Marketer info
        m.unique_id                            AS "marketerUniqueId",
        m.first_name || ' ' || m.last_name     AS "marketerName",

        -- Admin info
        a.unique_id                            AS "adminUniqueId",
        a.first_name || ' ' || a.last_name     AS "adminName",

        -- Product info with fallback for stock pickups
        COALESCE(p1.device_name, p2.device_name)   AS "deviceName",
        COALESCE(p1.device_model, p2.device_model) AS "deviceModel",
        COALESCE(p1.device_type, p2.device_type)   AS "deviceType",

        -- IMEIs they entered
        COALESCE(
          ARRAY_AGG(ii.imei ORDER BY ii.id)
            FILTER (WHERE ii.imei IS NOT NULL),
          ARRAY[]::text[]
        )                                      AS "imeis"

      FROM orders o

      -- only include marketers under this SuperAdmin’s admins
      JOIN users m
        ON m.id = o.marketer_id
      JOIN users a
        ON a.id = m.admin_id
       AND a.super_admin_id = $1

      -- first try the confirmed product
      LEFT JOIN products p1
        ON p1.id = o.product_id

      -- then fall back to the stock_update’s product
      LEFT JOIN stock_updates su
        ON su.id = o.stock_update_id
      LEFT JOIN products p2
        ON p2.id = su.product_id

      -- gather any IMEIs recorded at order time
      LEFT JOIN order_items oi
        ON oi.order_id = o.id
      LEFT JOIN inventory_items ii
        ON ii.id = oi.inventory_item_id

      GROUP BY
        o.id,
        o.bnpl_platform,
        o.number_of_devices,
        o.sold_amount,
        o.sale_date,
        o.status,
        m.unique_id,
        m.first_name,
        m.last_name,
        a.unique_id,
        a.first_name,
        a.last_name,
        p1.device_name,
        p1.device_model,
        p1.device_type,
        p2.device_name,
        p2.device_model,
        p2.device_type

      ORDER BY o.sale_date DESC
    `, [superId]);

    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAccountSettings,
  updateAccountSettings,
  registerAdmin,
  listHierarchy,
  getOrderHistoryForSuperAdmin,
};
