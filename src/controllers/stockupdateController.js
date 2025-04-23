// src/controllers/stockupdateController.js
const { pool } = require('../config/database');

/**
 * createStockUpdate - Called when a marketer picks up device(s) from a dealer.
 * Records the pickup event with quantity, sets a deadline 4 days from pickup,
 * and notifies the admin assigned to the marketer.
 *
 * Expected req.body:
 * {
 *   dealerUniqueId,      // Unique ID of the dealer (string) provided from a dropdown
 *   device_name,         // Name of the device (string)
 *   device_model,        // Model of the device (string)
 *   device_category,     // Category of the device (e.g., "Phone", "Tablet")
 *   quantity             // Number of devices picked up (defaults to 1 if not provided)
 * }
 *
 * The marketer's unique ID is retrieved from req.user.
 */
const createStockUpdate = async (req, res, next) => {
  try {
    const { product_id, quantity } = req.body;
    const marketerUID = req.user.unique_id;
    if (!product_id) {
      return res.status(400).json({ message: "Missing product_id" });
    }
    const qty = parseInt(quantity, 10) || 1;

    // 1) check stock
    const stockQ = await pool.query(
      `SELECT product_quantity FROM products WHERE id = $1`,
      [product_id]
    );
    if (!stockQ.rowCount || stockQ.rows[0].product_quantity < qty) {
      return res.status(400).json({ message: "Not enough stock available" });
    }

    // 2) decrement
    await pool.query(
      `UPDATE products
         SET product_quantity = product_quantity - $1
       WHERE id = $2`,
      [qty, product_id]
    );

    // 3) insert pickup with exactly 48 hours deadline
    const insertQ = `
      INSERT INTO stock_updates
        (marketer_id, product_id, quantity, pickup_date, deadline, transfer_status)
      VALUES (
        (SELECT id FROM users WHERE unique_id = $1),
         $2, $3,
         NOW(),
         NOW() + INTERVAL '48 hours',
         false,
         'none'
      )
      RETURNING *
    `;
    const { rows } = await pool.query(insertQ, [
      marketerUID,
      product_id,
      qty
    ]);
    const stock = rows[0];

    // 4) notify assigned admin (unchanged)
    const adminQ = await pool.query(
      `SELECT admin_id FROM users WHERE unique_id = $1`,
      [marketerUID]
    );
    const adminId = adminQ.rows[0]?.admin_id;
    if (adminId) {
      await pool.query(
        `INSERT INTO notifications (user_id, message, created_at)
         VALUES ($1, $2, NOW())`,
        [
          adminId,
          `Marketer ${marketerUID} picked up ${qty} unit(s).`
        ]
      );
    }

    res.status(201).json({
      message: "Stock pickup recorded successfully.",
      stock
    });
  } catch (err) {
    next(err);
  }
};
/**
 * requestStockTransfer
 *  - Marketer → asks to transfer one of their pickups to another marketer
 */
const requestStockTransfer = async (req, res, next) => {
  try {
    const { id } = req.params;              // stock_updates.id
    const { targetUniqueId } = req.body;    // another marketer.unique_id
    const fromUID = req.user.unique_id;

    // 1) ensure record belongs to this marketer
    const me = await pool.query(
      `SELECT marketer_id, transfer_status
         FROM stock_updates
        WHERE id = $1`,
      [id]
    );
    if (!me.rowCount) {
      return res.status(404).json({ message: "Pickup not found." });
    }
    if (me.rows[0].transfer_status !== 'none') {
      return res.status(400).json({ message: "Already in transfer." });
    }
    const myDbId = me.rows[0].marketer_id;

    // 2) resolve target user id & check same location
    const target = await pool.query(
      `SELECT id, state_of_residence
         FROM users
        WHERE unique_id = $1`,
      [targetUniqueId]
    );
    if (!target.rowCount) {
      return res.status(404).json({ message: "Target marketer not found." });
    }
    // assume current user also has state_of_residence in req.user
    if (target.rows[0].state_of_residence !== req.user.state_of_residence) {
      return res.status(400).json({ message: "Must be same location." });
    }

    // 3) mark the transfer request
    await pool.query(
      `UPDATE stock_updates
         SET transfer_to_marketer_id = (SELECT id FROM users WHERE unique_id = $1),
             transfer_status       = 'pending',
             transfer_requested_at = NOW()
       WHERE id = $2`,
      [targetUniqueId, id]
    );

    res.status(200).json({ message: "Transfer request submitted." });
  } catch (err) {
    next(err);
  }
};

/**
 * approveStockTransfer / rejectStockTransfer
 *  - MasterAdmin only
 */
const approveStockTransfer = async (req, res, next) => {
  try {
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: "Only MasterAdmin can approve." });
    }
    const { id } = req.params;
    const { action } = req.body; // 'approve' or 'reject'
    if (!['approve','reject'].includes(action)) {
      return res.status(400).json({ message: "Invalid action." });
    }

    let q, params;
    if (action === 'approve') {
      q = `
        UPDATE stock_updates
           SET marketer_id              = transfer_to_marketer_id,
               transfer_status          = 'approved',
               transfer_approved_at     = NOW()
         WHERE id = $1
         RETURNING *`;
      params = [id];
    } else {
      q = `
        UPDATE stock_updates
           SET transfer_status = 'rejected'
         WHERE id = $1
         RETURNING *`;
      params = [id];
    }

    const { rows } = await pool.query(q, params);
    if (!rows.length) {
      return res.status(404).json({ message: "Pickup not found." });
    }
    res.status(200).json({
      message: `Transfer ${action}d successfully.`,
      stock: rows[0]
    });
  } catch (err) {
    next(err);
  }
};

/**
 * getMarketerStockUpdates - Retrieves stock update records for the authenticated marketer.
 * It uses the marketer's unique ID (from req.user.unique_id) to filter stock updates.
 */
const getMarketerStockUpdates = async (req, res, next) => {
  try {
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer unique ID not available." });
    }
    const query = `
      SELECT *
      FROM stock_updates
      WHERE marketer_id = (SELECT id FROM users WHERE unique_id = $1)
      ORDER BY pickup_date DESC
    `;
    const { rows } = await pool.query(query, [marketerUniqueId]);
    return res.status(200).json({
      message: "Stock updates retrieved successfully.",
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getStockUpdates - Retrieves all stock update records based on the role of the requester.
 * - Master Admin sees all records.
 * - Admin sees records for marketers assigned to that admin.
 * - Super Admin sees records for marketers of admin(s) assigned to them.
 * For unsold records, computes a live countdown (time remaining until deadline).
 * Optionally filters by sold status (?sold=true/false).
 */
const getStockUpdates = async (req, res, next) => {
  try {
    const { sold } = req.query;
    const role = req.user.role;
    const uniqueId = req.user.unique_id;
    let query = "";
    let values = [];

    if (role === "MasterAdmin") {
      query = "SELECT * FROM stock_updates";
      if (sold !== undefined) {
        query += " WHERE sold = $1";
        values.push(sold === "true");
      }
    } else if (role === "Admin") {
      query = "SELECT * FROM stock_updates WHERE marketer_id IN (SELECT id FROM users WHERE admin_id = (SELECT id FROM users WHERE unique_id = $1))";
      values.push(uniqueId);
      if (sold !== undefined) {
        query += " AND sold = $" + (values.length + 1);
        values.push(sold === "true");
      }
    } else if (role === "SuperAdmin") {
      query = "SELECT * FROM stock_updates WHERE marketer_id IN (SELECT id FROM users WHERE admin_id IN (SELECT id FROM users WHERE super_admin_id = (SELECT id FROM users WHERE unique_id = $1)))";
      values.push(uniqueId);
      if (sold !== undefined) {
        query += " AND sold = $" + (values.length + 1);
        values.push(sold === "true");
      }
    } else {
      return res.status(403).json({ message: "Not authorized to view stock updates" });
    }

    query += " ORDER BY pickup_date DESC";
    const result = await pool.query(query, values);
    
    const stockUpdates = result.rows.map(record => {
      let countdown = null;
      if (!record.sold) {
        const now = new Date();
        const deadline = new Date(record.deadline);
        const diffMs = deadline - now;
        if (diffMs > 0) {
          const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
          countdown = `${days} days ${hours} hours ${minutes} minutes ${seconds} seconds`;
        } else {
          countdown = "Expired";
        }
      }
      return { ...record, countdown };
    });
    
    return res.status(200).json({
      message: "Stock updates retrieved successfully.",
      data: stockUpdates
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getStaleStockUpdates - Retrieves unsold stock records (past their deadline) based on the role of the requester.
 * For each stale record, triggers a notification to the marketer.
 */
const getStaleStockUpdates = async (req, res, next) => {
  try {
    const role = req.user.role;
    const uniqueId = req.user.unique_id;
    let query = "";
    let values = [];

    if (role === "MasterAdmin") {
      query = "SELECT * FROM stock_updates WHERE sold = false AND deadline < NOW()";
    } else if (role === "Admin") {
      query = "SELECT * FROM stock_updates WHERE sold = false AND deadline < NOW() AND marketer_id IN (SELECT id FROM users WHERE admin_id = (SELECT id FROM users WHERE unique_id = $1))";
      values.push(uniqueId);
    } else if (role === "SuperAdmin") {
      query = "SELECT * FROM stock_updates WHERE sold = false AND deadline < NOW() AND marketer_id IN (SELECT id FROM users WHERE admin_id IN (SELECT id FROM users WHERE super_admin_id = (SELECT id FROM users WHERE unique_id = $1)))";
      values.push(uniqueId);
    } else {
      return res.status(403).json({ message: "Not authorized to view stale stock updates" });
    }
    query += " ORDER BY pickup_date DESC";
    const result = await pool.query(query, values);

    result.rows.forEach(async (record) => {
      const notifQuery = `
        INSERT INTO notifications (user_id, message, created_at)
        VALUES ($1, $2, NOW())
      `;
      const message = `Stock update ID ${record.id} ("${record.device_name}" ${record.device_model}, quantity ${record.quantity}) picked up on ${new Date(record.pickup_date).toLocaleString()} is stale. Please report back to your assigned admin.`;
      await pool.query(notifQuery, [record.marketer_id, message]);
    });
    
    return res.status(200).json({
      message: "Stale stock updates retrieved successfully.",
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getStockUpdateHistory - Retrieves an aggregated history of stock updates (sold vs. unsold)
 * grouped by week, month, or year based on the requester's role:
 * - MasterAdmin sees all records.
 * - Admin sees records for marketers assigned to them.
 * - SuperAdmin sees records for marketers whose admins are assigned to them.
 * Expects a query parameter: ?period=week|month|year
 */
const getStockUpdateHistory = async (req, res, next) => {
  try {
    const { period } = req.query;
    const role = req.user.role;
    const uniqueId = req.user.unique_id;
    const validPeriods = ['week', 'month', 'year'];
    if (!period || !validPeriods.includes(period)) {
      return res.status(400).json({ message: "Invalid or missing period parameter. Use 'week', 'month', or 'year'." });
    }
    
    let query = "";
    let values = [];
    if (role === "MasterAdmin") {
      query = `
        SELECT date_trunc('${period}', pickup_date) AS period,
               SUM(quantity) AS total_quantity,
               SUM(CASE WHEN sold THEN quantity ELSE 0 END) AS sold_quantity,
               SUM(CASE WHEN NOT sold THEN quantity ELSE 0 END) AS unsold_quantity
        FROM stock_updates
        GROUP BY period
        ORDER BY period DESC;
      `;
    } else if (role === "Admin") {
      query = `
        SELECT date_trunc('${period}', pickup_date) AS period,
               SUM(quantity) AS total_quantity,
               SUM(CASE WHEN sold THEN quantity ELSE 0 END) AS sold_quantity,
               SUM(CASE WHEN NOT sold THEN quantity ELSE 0 END) AS unsold_quantity
        FROM stock_updates
        WHERE marketer_id IN (SELECT id FROM users WHERE admin_id = (SELECT id FROM users WHERE unique_id = $1))
        GROUP BY period
        ORDER BY period DESC;
      `;
      values.push(uniqueId);
    } else if (role === "SuperAdmin") {
      query = `
        SELECT date_trunc('${period}', pickup_date) AS period,
               SUM(quantity) AS total_quantity,
               SUM(CASE WHEN sold THEN quantity ELSE 0 END) AS sold_quantity,
               SUM(CASE WHEN NOT sold THEN quantity ELSE 0 END) AS unsold_quantity
        FROM stock_updates
        WHERE marketer_id IN (SELECT id FROM users WHERE admin_id IN (SELECT id FROM users WHERE super_admin_id = (SELECT id FROM users WHERE unique_id = $1)))
        GROUP BY period
        ORDER BY period DESC;
      `;
      values.push(uniqueId);
    } else {
      return res.status(403).json({ message: "Not authorized to view stock update history" });
    }
    
    const result = await pool.query(query, values);
    res.status(200).json({
      message: "Stock update history retrieved successfully.",
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createStockUpdate,
  getStockUpdates,
  getStaleStockUpdates,
  getMarketerStockUpdates,
  getStockUpdateHistory,
  requestStockTransfer,
  approveStockTransfer
};
