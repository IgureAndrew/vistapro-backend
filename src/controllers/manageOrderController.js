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
  const { orderId }       = req.params;
  const adminUniqueId     = req.user.unique_id;
  const client            = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Lock the order row
    const { rows: lock } = await client.query(
      `SELECT id, marketer_id, number_of_devices, commission_paid, stock_update_id
         FROM orders
        WHERE id = $1
        FOR UPDATE`,
      [orderId]
    );
    if (!lock.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found." });
    }
    const orderMeta = lock[0];
    if (orderMeta.commission_paid) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Commission already paid." });
    }

    // 2) Figure out device_type
    const { rows: info } = await client.query(
      `SELECT p.device_type
         FROM orders o
         LEFT JOIN stock_updates su ON o.stock_update_id = su.id
         LEFT JOIN products p      ON p.id = COALESCE(o.product_id, su.product_id)
        WHERE o.id = $1`,
      [orderId]
    );
    if (!info.length || !info[0].device_type) {
      throw new Error("Product not found for that order");
    }
    const deviceType = info[0].device_type.toLowerCase();

    // 3) Compute commission with ios instead of “iphone”
    const COMMISSION_RATES = {
      android: 10000,
      ios:     15000
    };
    const rate = COMMISSION_RATES[deviceType];
    if (!rate) throw new Error(`Unsupported device type: ${deviceType}`);
    const commission = rate * orderMeta.number_of_devices;

    // 4) Mark order confirmed & commission_paid
    const { rows: updatedRows } = await client.query(
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
    const updatedOrder = updatedRows[0];

    // 4.1) If this was a stock-pickup order, mark that pickup “sold”
    if (orderMeta.stock_update_id) {
      await client.query(
        `UPDATE stock_updates
            SET status = 'sold'
          WHERE id = $1`,
        [orderMeta.stock_update_id]
      );
    }

    // 5) Credit marketer’s commission into wallet
    const { rows: userRow } = await client.query(
      `SELECT unique_id FROM users WHERE id = $1`,
      [orderMeta.marketer_id]
    );
    if (!userRow.length) throw new Error("Marketer not found");
    const marketerUniqueId = userRow[0].unique_id;

    const { available, withheld } = await walletService.creditCommissionFromAmount(
      marketerUniqueId,
      orderId,
      commission
    );

    await client.query("COMMIT");

    return res.json({
      message: "Order confirmed, pickup marked sold, and commission credited.",
      order: updatedOrder,
      commissionBreakdown: { commission, available, withheld }
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
