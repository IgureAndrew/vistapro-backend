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
    // Extract dealerUniqueId and other fields from the request body.
    const { dealerUniqueId, device_name, device_model, device_category, quantity } = req.body;
    
    // Get the marketer's unique ID from the authenticated user.
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId || !dealerUniqueId || !device_name || !device_model || !device_category) {
      return res.status(400).json({ message: "Required fields missing." });
    }

    // Use provided quantity or default to 1 if not specified.
    const qty = quantity || 1;

    // Set the pickup date to now and deadline to 4 days later.
    const pickup_date = new Date();
    const deadline = new Date(pickup_date.getTime() + 4 * 24 * 60 * 60 * 1000);

    // Insert the stock update record.
    // We convert the marketer's and dealer's unique IDs to numeric IDs via subqueries.
    const insertQuery = `
      INSERT INTO stock_updates 
        (marketer_id, dealer_id, device_name, device_model, device_category, quantity, pickup_date, deadline, sold)
      VALUES (
        (SELECT id FROM users WHERE unique_id = $1),
        (SELECT id FROM users WHERE unique_id = $2),
        $3, $4, $5, $6, $7, $8, false
      )
      RETURNING *
    `;
    const values = [marketerUniqueId, dealerUniqueId, device_name, device_model, device_category, qty, pickup_date, deadline];
    const result = await pool.query(insertQuery, values);
    const stockRecord = result.rows[0];

    // Retrieve the assigned admin for the marketer from the users table.
    // We assume that a marketer record (role = 'Marketer') has an admin_id column.
    const adminQuery = `
      SELECT admin_id 
      FROM users 
      WHERE unique_id = $1 AND role = 'Marketer'
    `;
    const adminResult = await pool.query(adminQuery, [marketerUniqueId]);
    if (adminResult.rows.length > 0 && adminResult.rows[0].admin_id) {
      const admin_id = adminResult.rows[0].admin_id;
      const notifQuery = `
        INSERT INTO notifications (user_id, message, created_at)
        VALUES ($1, $2, NOW())
      `;
      const notifMessage = `Marketer ${marketerUniqueId} picked up ${qty} unit(s) of "${device_name}" (${device_model}, Category: ${device_category}). They must be sold within 4 days.`;
      await pool.query(notifQuery, [admin_id, notifMessage]);
    }

    return res.status(201).json({
      message: "Stock update record created successfully.",
      stock: stockRecord
    });
  } catch (error) {
    next(error);
  }
};

/**
 * markStockAsSold - Marks a stock update record as sold.
 * Expected req.params: { id } (stock update record id)
 * Only Master Admin is authorized to mark a record as sold.
 */
const markStockAsSold = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only Master Admin can mark stock as sold." });
    }
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Stock update id is required." });
    }
    const updateQuery = `
      UPDATE stock_updates
      SET sold = true, sold_date = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Stock update record not found." });
    }
    return res.status(200).json({
      message: "Stock marked as sold successfully.",
      stock: result.rows[0]
    });
  } catch (error) {
    next(error);
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
 * - MasterAdmin sees all records.
 * - Admin sees records for marketers assigned to that admin.
 * - SuperAdmin sees records for marketers whose admins are assigned to them.
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

    // Use join queries to get additional dealer and marketer information.
    if (role === "MasterAdmin") {
      query = `
        SELECT 
          su.*,
          (u_dealer.first_name || ' ' || u_dealer.last_name) AS dealer_name,
          u_dealer.unique_id AS dealer_unique_id,
          (u_marketer.first_name || ' ' || u_marketer.last_name) AS marketer_name,
          u_marketer.unique_id AS marketer_unique_id
        FROM stock_updates su
        JOIN users u_marketer ON su.marketer_id = u_marketer.id
        JOIN users u_dealer ON su.dealer_id = u_dealer.id
      `;
      if (sold !== undefined) {
        query += " WHERE su.sold = $1";
        values.push(sold === "true");
      }
    } else if (role === "Admin") {
      query = `
        SELECT 
          su.*,
          (u_dealer.first_name || ' ' || u_dealer.last_name) AS dealer_name,
          u_dealer.unique_id AS dealer_unique_id,
          (u_marketer.first_name || ' ' || u_marketer.last_name) AS marketer_name,
          u_marketer.unique_id AS marketer_unique_id
        FROM stock_updates su
        JOIN users u_marketer ON su.marketer_id = u_marketer.id
        JOIN users u_dealer ON su.dealer_id = u_dealer.id
        WHERE u_marketer.admin_id = (SELECT id FROM users WHERE unique_id = $1)
      `;
      values.push(uniqueId);
      if (sold !== undefined) {
        query += " AND su.sold = $" + (values.length + 1);
        values.push(sold === "true");
      }
    } else if (role === "SuperAdmin") {
      query = `
        SELECT 
          su.*,
          (u_dealer.first_name || ' ' || u_dealer.last_name) AS dealer_name,
          u_dealer.unique_id AS dealer_unique_id,
          (u_marketer.first_name || ' ' || u_marketer.last_name) AS marketer_name,
          u_marketer.unique_id AS marketer_unique_id
        FROM stock_updates su
        JOIN users u_marketer ON su.marketer_id = u_marketer.id
        JOIN users u_dealer ON su.dealer_id = u_dealer.id
        WHERE u_marketer.admin_id IN (
          SELECT id FROM users WHERE super_admin_id = (SELECT id FROM users WHERE unique_id = $1)
        )
      `;
      values.push(uniqueId);
      if (sold !== undefined) {
        query += " AND su.sold = $" + (values.length + 1);
        values.push(sold === "true");
      }
    } else {
      return res.status(403).json({ message: "Not authorized to view stock updates" });
    }

    query += " ORDER BY su.pickup_date DESC";
    const result = await pool.query(query, values);

    // Compute live countdown for unsold stock records.
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

    // For each stale record, insert a notification for the marketer.
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
  markStockAsSold,
  getStockUpdates,
  getStaleStockUpdates,
  getMarketerStockUpdates,
  getStockUpdateHistory,
};
