// src/controllers/stockController.js
const { pool } = require('../config/database');

/**
 * addStock - Adds a new stock item.
 * Expects the following fields in req.body:
 *   - marketer_id, device_name, device_model, quantity
 * Sets pickup_time to NOW(), status to 'active', and created_at to NOW().
 */
const addStock = async (req, res, next) => {
  try {
    const { marketer_id, device_name, device_model, quantity } = req.body;
    if (!marketer_id || !device_name || !device_model || quantity === undefined) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const query = `
      INSERT INTO stock (marketer_id, device_name, device_model, quantity, status, pickup_time, created_at)
      VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
      RETURNING *
    `;
    const values = [marketer_id, device_name, device_model, quantity];
    const result = await pool.query(query, values);
    return res.status(201).json({
      message: "Stock item added successfully.",
      stock: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getStock - Retrieves all stock items.
 * Joins the stock table with the users table to include the marketer's name.
 * Also calculates the countdown until 4 days from pickup_time (or created_at if pickup_time is null).
 */
const getStock = async (req, res, next) => {
  try {
    const query = `
      SELECT s.*, u.name AS marketer_name
      FROM stock s
      JOIN users u ON s.marketer_id = u.id
      ORDER BY s.created_at DESC
    `;
    const result = await pool.query(query);
    const stocks = result.rows.map(row => {
      const pickupTime = new Date(row.pickup_time || row.created_at);
      const deadline = new Date(pickupTime.getTime() + 4 * 24 * 60 * 60 * 1000);
      let diffMs = deadline - Date.now();
      if (diffMs < 0) diffMs = 0;
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      return {
        ...row,
        time_remaining: {
          days,
          hours,
          minutes,
          seconds
        }
      };
    });
    return res.status(200).json({
      message: "Stock items retrieved successfully.",
      stock: stocks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * updateStock - Updates an existing stock item by id.
 * Accepts fields such as device_name, device_model, quantity, and status.
 */
const updateStock = async (req, res, next) => {
  try {
    const stockId = req.params.id;
    const { device_name, device_model, quantity, status } = req.body;
    const query = `
      UPDATE stock
      SET 
        device_name = COALESCE($1, device_name),
        device_model = COALESCE($2, device_model),
        quantity = COALESCE($3, quantity),
        status = COALESCE($4, status),
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `;
    const values = [device_name, device_model, quantity, status, stockId];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Stock item not found." });
    }
    return res.status(200).json({
      message: "Stock item updated successfully.",
      stock: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * deleteStock - Deletes a stock item by id.
 */
const deleteStock = async (req, res, next) => {
  try {
    const stockId = req.params.id;
    const query = `DELETE FROM stock WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [stockId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Stock item not found." });
    }
    return res.status(200).json({
      message: "Stock item deleted successfully.",
      stock: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * updateStaleStock - Marks stock items as "stale" if held for more than 4 days.
 * Additionally, if any stock items are flagged as stale:
 *   - Flags the marketer's account (warning_flag = true).
 *   - Sends notifications to the marketer, the assigned Admin, the Super Admin of that Admin, and all Master Admins.
 */
const updateStaleStock = async (req, res, next) => {
  try {
    const marketerId = req.user.id;
    const thresholdInterval = "4 days";
    // Calculate cutoff using pickup_time or fallback to created_at.
    const cutoffResult = await pool.query(
      `SELECT NOW() - INTERVAL '${thresholdInterval}' AS cutoff;`
    );
    const cutoffDate = cutoffResult.rows[0].cutoff;

    const updateQuery = `
      UPDATE stock
      SET status = 'stale',
          updated_at = NOW()
      WHERE marketer_id = $1
        AND status = 'active'
        AND COALESCE(pickup_time, created_at) <= $2
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [marketerId, cutoffDate]);
    if (result.rows.length === 0) {
      return res.status(200).json({
        message: "No stale stock items found.",
        stock: []
      });
    }
    // Flag the marketer's account.
    await pool.query(`UPDATE users SET warning_flag = true WHERE id = $1;`, [marketerId]);

    // Notification for the marketer.
    const notifMsgMarketer = `Your stock items have been held for over 4 days and marked as stale. Your account has been flagged. Please return the products immediately.`;
    await pool.query(
      `INSERT INTO notifications (recipient_id, message, created_at) VALUES ($1, $2, NOW());`,
      [marketerId, notifMsgMarketer]
    );

    // Retrieve the marketer's record to get the assigned admin.
    const marketerRes = await pool.query(`SELECT * FROM users WHERE id = $1;`, [marketerId]);
    const marketer = marketerRes.rows[0];
    if (marketer && marketer.admin_id) {
      // Notify the Admin.
      const notifMsgAdmin = `Marketer ${marketer.name} has stale stock items (held over 4 days). Please review.`;
      await pool.query(
        `INSERT INTO notifications (recipient_id, message, created_at) VALUES ($1, $2, NOW());`,
        [marketer.admin_id, notifMsgAdmin]
      );
      // Retrieve the Admin's record for Super Admin info.
      const adminRes = await pool.query(`SELECT * FROM users WHERE id = $1;`, [marketer.admin_id]);
      const admin = adminRes.rows[0];
      if (admin && admin.super_admin_id) {
        const notifMsgSuperAdmin = `Admin ${admin.name} has a marketer (${marketer.name}) with stale stock items.`;
        await pool.query(
          `INSERT INTO notifications (recipient_id, message, created_at) VALUES ($1, $2, NOW());`,
          [admin.super_admin_id, notifMsgSuperAdmin]
        );
      }
    }

    // Notify all Master Admins.
    const masterAdminsRes = await pool.query(`SELECT id, name FROM users WHERE role = 'MasterAdmin';`);
    const masterAdmins = masterAdminsRes.rows;
    for (const ma of masterAdmins) {
      const notifMsgMaster = `Marketer ${marketer.name} (under Admin ID ${marketer.admin_id || 'N/A'}) has stale stock items that require immediate attention.`;
      await pool.query(
        `INSERT INTO notifications (recipient_id, message, created_at) VALUES ($1, $2, NOW());`,
        [ma.id, notifMsgMaster]
      );
    }

    return res.status(200).json({
      message: "Stale stock updated and notifications sent.",
      stock: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addStock,
  getStock,
  updateStock,
  deleteStock,
  updateStaleStock,
};
