// src/controllers/manageOrderController.js

const { pool } = require("../config/database");
const walletService = require("../services/walletService");

/**
 * GET /api/manage-orders/orders
 * List all pending orders for MasterAdmin to review.
 */
async function getPendingOrders(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        o.id,
        u.first_name           AS marketer_name,
        o.bnpl_platform,
        p.device_name,
        p.device_model,
        p.device_type,
        o.number_of_devices,
        o.sold_amount,
        o.sale_date            AS sale_date,
        o.status
      FROM orders o
      LEFT JOIN stock_updates su
        ON o.stock_update_id = su.id
      LEFT JOIN products p
        ON p.id = COALESCE(o.product_id, su.product_id)
      JOIN users u
        ON o.marketer_id = u.id
      WHERE o.status = 'pending'
        AND u.role = 'Marketer'
      ORDER BY o.sale_date DESC
    `);
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/manage-orders/orders/:orderId/confirm
 * MasterAdmin confirms an order (stock or free).
 */
async function confirmOrder(req, res, next) {
  const { orderId }   = req.params;
  const adminUniqueId = req.user.unique_id;
  const client        = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Lock and fetch the order
    const { rows: lockRows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const order = lockRows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found." });
    }

    // 2) If stock-pickup order, mark reserved IMEIs sold and update pickup status
    if (order.stock_update_id) {
      await client.query(
        `UPDATE inventory_items
           SET status = 'sold'
         WHERE stock_update_id = $1
           AND status = 'reserved'`,
        [order.stock_update_id]
      );
      await client.query(
        `UPDATE stock_updates
           SET status = 'sold'
         WHERE id = $1`,
        [order.stock_update_id]
      );
    }

    // 3) Update order status and record who confirmed it
    const { rows: updatedRows } = await client.query(
      `UPDATE orders
          SET status       = 'confirmed',
              confirmed_by = $2,
              confirmed_at = NOW(),
              updated_at   = NOW()
        WHERE id = $1
        RETURNING *`,
      [orderId, adminUniqueId]
    );
    const updatedOrder = updatedRows[0];

    // 4) Determine device type and commission
    const { rows: infoRows } = await client.query(
      `SELECT p.device_type
         FROM orders o
         LEFT JOIN stock_updates su ON o.stock_update_id = su.id
         LEFT JOIN products p      ON p.id = COALESCE(o.product_id, su.product_id)
        WHERE o.id = $1`,
      [orderId]
    );
    const deviceType = infoRows[0].device_type.toLowerCase();
    const rates = { android: 10000, ios: 15000 };
    const rate  = rates[deviceType] || 0;
    const commissionAmount = rate * updatedOrder.number_of_devices;

    // 5) Credit commissions via walletService
    // walletService will handle marketer, admin, superadmin splits
    await walletService.creditCommissionFromAmount(
      req.user.unique_id,
      orderId,
      commissionAmount
    );

    await client.query("COMMIT");
    res.json({
      message: "Order confirmed, stock marked sold, and commissions credited.",
      order: updatedOrder
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}


/**
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
    const { unique_id: uid, role } = req.user;
    let base = `
      SELECT
        o.id,
        u.first_name           AS marketer_name,
        o.bnpl_platform,
        p.device_name,
        p.device_model,
        p.device_type,
        o.number_of_devices,
        o.sold_amount,
        o.sale_date            AS sale_date,
        o.status
      FROM orders o
      LEFT JOIN stock_updates su
        ON o.stock_update_id = su.id
      LEFT JOIN products p
        ON p.id = COALESCE(o.product_id, su.product_id)
      JOIN users u
        ON o.marketer_id = u.id
    `;
    let where = "";
    const params = [];

    if (role === "MasterAdmin") {
      where = `WHERE u.role = 'Marketer'`;
    } else if (role === "Admin") {
      where = `WHERE u.admin_id = (SELECT id FROM users WHERE unique_id = $1)`;
      params.push(uid);
    } else if (role === "SuperAdmin") {
      base += ` JOIN users a ON u.admin_id = a.id `;
      where = `WHERE a.super_admin_id = (SELECT id FROM users WHERE unique_id = $1)`;
      params.push(uid);
    } else {
      return res.status(403).json({ message: "Permission denied." });
    }

    const { rows } = await pool.query(
      `${base} ${where} ORDER BY o.sale_date DESC`,
      params
    );
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/manage-orders/orders/:orderId
 */
async function updateOrder(req, res, next) {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only MasterAdmin can update orders." });
    }
    const { orderId } = req.params;
    const updates = req.body;
    const allowed = ["status", "sold_amount", "number_of_devices", "bnpl_platform"];
    const sets = [];
    const vals = [];
    let idx = 1;

    for (const key of Object.keys(updates)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = $${idx}`);
      vals.push(updates[key]);
      idx++;
    }
    if (!sets.length) {
      return res.status(400).json({ message: "No valid fields to update." });
    }
    vals.push(orderId);

    const { rows } = await pool.query(
      `UPDATE orders
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $${idx}
        RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ message: "Order not found." });
    res.json({ message: "Order updated.", order: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/manage-orders/orders/:orderId
 */
async function deleteOrder(req, res, next) {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only MasterAdmin can delete orders." });
    }
    const { orderId } = req.params;
    const { rows } = await pool.query(
      `DELETE FROM orders WHERE id = $1 RETURNING *`,
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
