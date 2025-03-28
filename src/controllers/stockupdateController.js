// src/controllers/stockupdateController.js
const { pool } = require('../config/database');

/**
 * createStockUpdate - Called when a marketer picks up device(s) from a dealer.
 * Records the pickup event with quantity, setting a deadline 4 days from pickup.
 * Also notifies the admin assigned to the marketer.
 * Expected req.body: { marketer_id, dealer_id, device_id, device_category, quantity }
 */
const createStockUpdate = async (req, res, next) => {
  try {
    const { marketer_id, dealer_id, device_id, device_category, quantity } = req.body;
    if (!marketer_id || !dealer_id || !device_id || !device_category) {
      return res.status(400).json({ message: "Required fields missing." });
    }
    // Use provided quantity or default to 1 if not specified
    const qty = quantity || 1;
    
    const pickup_date = new Date();
    // Compute deadline = pickup_date + 4 days
    const deadline = new Date(pickup_date.getTime() + 4 * 24 * 60 * 60 * 1000);
    
    const insertQuery = `
      INSERT INTO stock_updates 
        (marketer_id, dealer_id, device_id, device_category, quantity, pickup_date, deadline, sold)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false)
      RETURNING *
    `;
    const values = [marketer_id, dealer_id, device_id, device_category, qty, pickup_date, deadline];
    const result = await pool.query(insertQuery, values);
    const stockRecord = result.rows[0];
    
    // Notify admin assigned to the marketer.
    // Assume the "marketers" table has an admin_id column.
    const adminQuery = `SELECT admin_id FROM marketers WHERE id = $1`;
    const adminResult = await pool.query(adminQuery, [marketer_id]);
    if (adminResult.rows.length > 0) {
      const admin_id = adminResult.rows[0].admin_id;
      const notifQuery = `
        INSERT INTO notifications (user_id, message, created_at)
        VALUES ($1, $2, NOW())
      `;
      const notifMessage = `Marketer ${marketer_id} picked up ${qty} unit(s) of device ${device_id} (Category: ${device_category}). They must be sold within 4 days.`;
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
 */
const markStockAsSold = async (req, res, next) => {
  try {
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
 * getStockUpdates - Retrieves all stock update records.
 * For unsold records, computes a countdown (time remaining until deadline).
 * Optionally filters by sold status (?sold=true/false).
 */
const getStockUpdates = async (req, res, next) => {
  try {
    const { sold } = req.query;
    let query = "SELECT * FROM stock_updates";
    const values = [];
    if (sold !== undefined) {
      query += " WHERE sold = $1";
      values.push(sold === "true");
    }
    query += " ORDER BY pickup_date DESC";
    const result = await pool.query(query, values);
    
    // Compute countdown for unsold stock records.
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
      return {
        ...record,
        countdown
      };
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
 * getStaleStockUpdates - Retrieves unsold stock records that are past their deadline.
 * Optionally triggers a notification to the marketer about stale stock.
 */
const getStaleStockUpdates = async (req, res, next) => {
  try {
    const query = `
      SELECT * FROM stock_updates
      WHERE sold = false AND deadline < NOW()
      ORDER BY pickup_date DESC
    `;
    const result = await pool.query(query);
    
    // For each stale record, send a notification to the marketer.
    result.rows.forEach(async (record) => {
      const notifQuery = `
        INSERT INTO notifications (user_id, message, created_at)
        VALUES ($1, $2, NOW())
      `;
      const message = `Stock ID ${record.id} (device ${record.device_id}, quantity ${record.quantity}) picked up on ${new Date(record.pickup_date).toLocaleString()} is stale. Please report back to your assigned admin.`;
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

module.exports = {
  createStockUpdate,
  markStockAsSold,
  getStockUpdates,
  getStaleStockUpdates,
};
