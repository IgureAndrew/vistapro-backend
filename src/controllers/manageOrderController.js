const { pool } = require("../config/database");
const walletService = require("../services/walletService");

/**
 * GET /api/manage-orders/orders
 */
async function getPendingOrders(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        o.id,
        o.number_of_devices,
        o.sold_amount,
        o.sale_date,
        o.status,
        p.device_name,
        p.device_model,
        o.bnpl_platform,
        u.first_name     AS marketer_name,
        u.unique_id      AS marketer_unique_id
      FROM orders o
      LEFT JOIN products p   ON o.product_id       = p.id
      JOIN users u           ON o.marketer_id      = u.id
      WHERE o.status = 'pending'
        AND u.role   = 'Marketer'
      ORDER BY o.sale_date DESC
    `);
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * confirmOrder - MasterAdmin only
 * PATCH /api/manage-orders/orders/:orderId/confirm
 */
// src/controllers/manageOrderController.js

async function confirmOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const adminId     = req.user.unique_id;

    // 1) Mark the order as confirmed
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

    // ─────────────────────────────────────────────────────────────
    // 2) Calculate total commission
const commission = Number(order.earnings_per_device) * order.number_of_devices;
if (commission <= 0) throw new Error('Order earnings_per_device is missing or zero');

    // Fetch the marketer’s string‐ID, then credit their wallet
    const { rows: urows } = await pool.query(
      `SELECT unique_id FROM users WHERE id = $1`,
      [order.marketer_id]
    );
    if (!urows.length) {
      return res.status(500).json({ message: 'Marketer not found.' });
    }
    const marketerUniqueId = urows[0].unique_id;

    // 3) Credit commission (40% available, 60% withheld)
  
const { available, withheld } = await walletService.creditCommissionFromAmount(
  marketerUniqueId,
  order.id,
  commission
);
    // ─────────────────────────────────────────────────────────────

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
 * confirmOrderToDealer - MasterAdmin only
 * PATCH /api/manage-orders/orders/:orderId/confirm-to-dealer
 */
async function confirmOrderToDealer(req, res, next) {
  try {
    const { orderId } = req.params;
    const { rows } = await pool.query(
      `UPDATE orders
          SET status       = 'confirmed_to_dealer',
              confirmed_at = NOW(),
              updated_at   = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [orderId]
    );
    if (!rows.length) return res.status(404).json({ message: "Order not found." });
    res.json({ message: "Order confirmed to dealer.", order: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/manage-orders/orders/history
 */
async function getOrderHistory(req, res, next) {
  try {
    const { unique_id: userUniqueId, role } = req.user;
    let query, values = [];

    // same logic for Master/Super/Admin, but always select name, status, device, etc.
    if (role === "MasterAdmin") {
      query = `
        SELECT
          o.id,
          o.number_of_devices,
          o.sold_amount,
          o.sale_date,
          o.status,
          p.device_name,
          p.device_model,
          o.bnpl_platform,
          u.first_name     AS marketer_name,
          u.unique_id      AS marketer_unique_id
        FROM orders o
        LEFT JOIN products p ON o.product_id    = p.id
        JOIN users u         ON o.marketer_id   = u.id
        WHERE u.role = 'Marketer'
      `;
    } else if (role === "SuperAdmin") {
      query = `
        SELECT
          o.id,
          o.number_of_devices,
          o.sold_amount,
          o.sale_date,
          o.status,
          p.device_name,
          p.device_model,
          o.bnpl_platform,
          u.first_name     AS marketer_name,
          u.unique_id      AS marketer_unique_id,
          a.unique_id      AS admin_unique_id
        FROM orders o
        LEFT JOIN products p ON o.product_id    = p.id
        JOIN users u         ON o.marketer_id   = u.id
        JOIN users a         ON u.admin_id      = a.id
        WHERE a.super_admin_id = (SELECT id FROM users WHERE unique_id = $1)
      `;
      values = [userUniqueId];
    } else if (role === "Admin") {
      query = `
        SELECT
          o.id,
          o.number_of_devices,
          o.sold_amount,
          o.sale_date,
          o.status,
          p.device_name,
          p.device_model,
          o.bnpl_platform,
          u.first_name     AS marketer_name,
          u.unique_id      AS marketer_unique_id
        FROM orders o
        LEFT JOIN products p ON o.product_id    = p.id
        JOIN users u         ON o.marketer_id   = u.id
        WHERE u.admin_id = (SELECT id FROM users WHERE unique_id = $1)
      `;
      values = [userUniqueId];
    } else {
      return res.status(403).json({ message: "Permission denied." });
    }

    query += " ORDER BY o.sale_date DESC";
    const { rows } = await pool.query(query, values);
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * updateOrder – MasterAdmin only
 */
async function updateOrder(req, res, next) {
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
    let   idx        = 1;
    for (const key in updatedData) {
      setClauses.push(`${key} = $${idx}`);
      values.push(updatedData[key]);
      idx++;
    }
    values.push(orderId);

    const { rows } = await pool.query(
      `
      UPDATE orders
         SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${idx}
       RETURNING *
      `,
      values
    );
    if (!rows.length) return res.status(404).json({ message: "Order not found." });
    res.json({ message: "Order updated.", order: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * deleteOrder – MasterAdmin only
 */
async function deleteOrder(req, res, next) {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only Master Admin can delete orders." });
    }
    const { orderId } = req.params;
    const { rows } = await pool.query(
      "DELETE FROM orders WHERE id = $1 RETURNING *",
      [orderId]
    );
    if (!rows.length) return res.status(404).json({ message: "Order not found." });
    res.json({ message: "Order deleted.", order: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPendingOrders,
  confirmOrder,
  confirmOrderToDealer,
  getOrderHistory,
  updateOrder,
  deleteOrder,
};
