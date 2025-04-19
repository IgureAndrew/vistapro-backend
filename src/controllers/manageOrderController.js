// src/controllers/manageOrderController.js
const { pool } = require("../config/database");
const walletService = require('../services/walletService');

/**
 * getOrders - Retrieves pending orders created by marketers.
 * If you want to show *all* orders (not just pending) in your marketer dashboard,
 * remove the `o.status = 'pending'` clause here.
 */
async function getOrders(req, res, next) {
  try {
    const userId = req.user.id;
  const { rows } = await pool.query(`
    SELECT o.*, u.unique_id AS marketer_unique_id
     FROM orders o
     JOIN users u ON o.marketer_id = u.id
     WHERE o.status = 'pending' AND u.role = 'Marketer'
  ORDER BY o.created_at DESC`, );
  
    res.json({ orders: rows });
  } catch (err) { next(err) }
}
/**
 * confirmOrder - Confirms a pending order, splits the commission 40/60,
 * updates the marketer’s wallet, and logs two wallet transactions.
 */
async function confirmOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const adminId     = req.user.unique_id;

    // 1) Mark order confirmed
    const { rows } = await pool.query(
      `UPDATE orders
          SET status       = 'confirmed',
              confirmed_by = $2,
              confirmed_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [orderId, adminId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    const order = rows[0];
       // 1b) Look up the marketer’s unique_id (string) from users table
   const { rows: urows } = await pool.query(
    `SELECT unique_id FROM users WHERE id = $1`,
     [order.marketer_id]
   );
   if (!urows.length) {
     return res.status(500).json({ message: 'Marketer not found.' });
   }
   const marketerUniqueId = urows[0].unique_id;

    // 2) Credit commission

    const { commission, available, withheld } =
         await walletService.creditCommission(
          marketerUniqueId,
          order.id,
           order.device_type
         );

    // 3) Respond
    res.json({
      message: 'Order confirmed and commission credited.',
      order,
      commissionBreakdown: { commission, available, withheld }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * confirmOrderToDealer - Confirms an order on the dealer side.
 */
const confirmOrderToDealer = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const { rows } = await pool.query(
      `
      UPDATE orders
         SET status       = 'confirmed_to_dealer',
             confirmed_at = NOW(),
             updated_at   = NOW()
       WHERE id = $1
       RETURNING *
      `,
      [orderId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    res.status(200).json({
      message: "Order confirmed to dealer successfully.",
      order:   rows[0],
    });
  } catch (err) {
    next(err);
  }
};

/**
 * getOrderHistory - Returns all orders visible to MasterAdmin, SuperAdmin or Admin.
 */
const getOrderHistory = async (req, res, next) => {
  try {
    const { unique_id: userUniqueId, role } = req.user;
    let query, values = [];

    if (role === "MasterAdmin") {
      query = `
        SELECT o.*, u.unique_id AS marketer_unique_id
          FROM orders o
          JOIN users u ON o.marketer_id = u.id
         WHERE u.role = 'Marketer'
      `;
    } else if (role === "SuperAdmin") {
      query = `
        SELECT o.*, u.unique_id AS marketer_unique_id, a.unique_id AS admin_unique_id
          FROM orders o
          JOIN users u ON o.marketer_id = u.id
          JOIN users a ON u.admin_id = a.id
         WHERE a.super_admin_id = (
           SELECT id FROM users WHERE unique_id = $1
         )
      `;
      values = [userUniqueId];
    } else if (role === "Admin") {
      query = `
        SELECT o.*, u.unique_id AS marketer_unique_id
          FROM orders o
          JOIN users u ON o.marketer_id = u.id
         WHERE u.admin_id = (
           SELECT id FROM users WHERE unique_id = $1
         )
      `;
      values = [userUniqueId];
    } else {
      return res.status(403).json({ message: "Permission denied." });
    }

    query += " ORDER BY o.created_at DESC";
    const { rows } = await pool.query(query, values);
    res.status(200).json({ orders: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * updateOrder – MasterAdmin only
 */
const updateOrder = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only Master Admin can update orders." });
    }
    const { orderId, updatedData } = req.body;
    if (!orderId || !updatedData) {
      return res.status(400).json({ message: "orderId and updatedData are required." });
    }

    const setClauses = [];
    const values     = [];
    let   i          = 1;

    for (const key in updatedData) {
      setClauses.push(`${key} = $${i}`);
      values.push(updatedData[key]);
      i++;
    }
    values.push(orderId);

    const { rows } = await pool.query(
      `
      UPDATE orders
         SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${i}
       RETURNING *
      `,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    res.status(200).json({ message: "Order updated.", order: rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * deleteOrder – MasterAdmin only
 */
const deleteOrder = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only Master Admin can delete orders." });
    }
    const orderId = req.params.id;
    const { rows } = await pool.query(
      "DELETE FROM orders WHERE id = $1 RETURNING *",
      [orderId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    res.status(200).json({ message: "Order deleted.", order: rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getOrders,
  confirmOrder,
  confirmOrderToDealer,
  getOrderHistory,
  updateOrder,
  deleteOrder,
};
