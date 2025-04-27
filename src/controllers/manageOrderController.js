// src/controllers/manageOrderController.js
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
async function confirmOrder(req, res, next) {
  const { orderId }       = req.params;
  const adminUniqueId     = req.user.unique_id;
  const client            = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Lock the order row
    const orderRes = await client.query(
      `SELECT id, marketer_id, sold_amount, number_of_devices, commission_paid
         FROM orders
        WHERE id = $1
          FOR UPDATE`,
      [orderId]
    );
    if (!orderRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found." });
    }
    const order = orderRes.rows[0];

    // 2) Prevent double-paying
    if (order.commission_paid) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Commission already paid." });
    }

    // 3) Compute commission (40% of sale)
    const totalSale   = Number(order.sold_amount);
    const deviceCount = order.number_of_devices;
    const RATE        = 0.4;
    if (totalSale <= 0 || deviceCount <= 0) {
      throw new Error("Invalid sale amount or device count");
    }
    const commission = totalSale * RATE;

    // 4) Update order to confirmed + flag commission_paid
    const confirmRes = await client.query(
      `UPDATE orders
          SET status          = 'confirmed',
              confirmed_by    = $2,
              confirmed_at    = NOW(),
              commission_paid = TRUE,
              updated_at      = NOW()
        WHERE id = $1
        RETURNING *`,
      [orderId, adminUniqueId]
    );
    const updatedOrder = confirmRes.rows[0];

    // 5) Look up marketer’s unique_id
    const userRes = await client.query(
      `SELECT unique_id FROM users WHERE id = $1`,
      [order.marketer_id]
    );
    if (!userRes.rows.length) throw new Error("Marketer not found.");
    const marketerUniqueId = userRes.rows[0].unique_id;

    // 6) Credit the wallet
    const { available, withheld } = await walletService.creditCommissionFromAmount(
      marketerUniqueId,
      orderId,
      commission
    );

    await client.query("COMMIT");
    return res.json({
      message: "Order confirmed and commission credited.",
      order: updatedOrder,
      commissionBreakdown: { commission, available, withheld }
    });

  } catch (err) {
    await client.query("ROLLBACK");
    return next(err);
  } finally {
    client.release();
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
        RETURNING *`,
      [orderId]
    );
    if (!rows.length) return res.status(404).json({ message: "Order not found." });
    return res.json({ message: "Order confirmed to dealer.", order: rows[0] });
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
        WHERE a.super_admin_id = (
          SELECT id FROM users WHERE unique_id = $1
        )
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
        WHERE u.admin_id = (
          SELECT id FROM users WHERE unique_id = $1
        )
      `;
      values = [userUniqueId];
    } else {
      return res.status(403).json({ message: "Permission denied." });
    }

    query += " ORDER BY o.sale_date DESC";
    const { rows } = await pool.query(query, values);
    return res.json({ orders: rows });
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

    // whitelist updatable fields
    const allowed = [
      "status",
      "sold_amount",
      "number_of_devices",
      "bnpl_platform"
    ];

    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of Object.keys(updatedData)) {
      if (!allowed.includes(key)) continue;
      setClauses.push(`${key} = $${idx}`);
      values.push(updatedData[key]);
      idx++;
    }
    if (!setClauses.length) {
      return res.status(400).json({ message: "No valid fields to update." });
    }
    values.push(orderId);

    const { rows } = await pool.query(
      `UPDATE orders
         SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${idx}
       RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ message: "Order not found." });
    return res.json({ message: "Order updated.", order: rows[0] });
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
    return res.json({ message: "Order deleted.", order: rows[0] });
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
