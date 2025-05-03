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
        u.first_name           AS marketer_name,
        o.bnpl_platform,
        -- grab product info either directly or via the stock update
        p.device_name,
        p.device_model,
        p.device_type,
        o.number_of_devices,
        o.sold_amount,
        o.sale_date            AS sale_date,
        o.status
      FROM orders o
      -- if this is a stock‐pickup order, join its stock_update
      LEFT JOIN stock_updates su
        ON o.stock_update_id = su.id
      -- then join products by whichever id is present
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
 * confirmOrder - MasterAdmin only
 * PATCH /api/manage-orders/orders/:orderId/confirm
 */
const COMMISSION_RATES = {
  android: 10000,
  iphone:  15000,
};

async function confirmOrder(req, res, next) {
  const { orderId }   = req.params;
  const adminUniqueId = req.user.unique_id;
  const client        = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Lock just the orders row
    const lockRes = await client.query(
      `SELECT id, marketer_id, number_of_devices, commission_paid
         FROM orders
        WHERE id = $1
        FOR UPDATE`,
      [orderId]
    );
    if (!lockRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found." });
    }
    const orderMeta = lockRes.rows[0];
    if (orderMeta.commission_paid) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Commission already paid." });
    }

    // 2) Pull device_type via COALESCE on either product_id or stock_update_id
    const { rows } = await client.query(
      `
      SELECT
        p.device_type
      FROM orders o
      LEFT JOIN stock_updates su
        ON o.stock_update_id = su.id
      LEFT JOIN products p
        ON p.id = COALESCE(o.product_id, su.product_id)
      WHERE o.id = $1
      `,
      [orderId]
    );
    if (!rows.length || !rows[0].device_type) {
      throw new Error("Product or stock not found for that order");
    }
    const deviceType = rows[0].device_type.toLowerCase();

    // 3) Compute the commission
    const COMMISSION_RATES = { android: 10000, iphone: 15000 };
    const rate = COMMISSION_RATES[deviceType];
    if (!rate) throw new Error(`Unsupported device type: ${deviceType}`);
    const commission = rate * orderMeta.number_of_devices;

    // 4) Mark order confirmed & commission_paid
    const upd = await client.query(
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
    const updatedOrder = upd.rows[0];

    // 5) Credit into the marketer’s wallet
    const userRes = await client.query(
      `SELECT unique_id FROM users WHERE id = $1`,
      [orderMeta.marketer_id]
    );
    if (!userRes.rows.length) throw new Error("Marketer not found.");
    const marketerUniqueId = userRes.rows[0].unique_id;

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
    next(err);
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
    const { unique_id: uid, role } = req.user;
    let query, values = [];

    // common SELECT with the same lateral‐join trick
    const base = `
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

    if (role === "MasterAdmin") {
      query = base + `
        WHERE u.role = 'Marketer'
        ORDER BY o.sale_date DESC
      `;
    } else if (role === "Admin") {
      query = base + `
        WHERE u.admin_id = (SELECT id FROM users WHERE unique_id = $1)
        ORDER BY o.sale_date DESC
      `;
      values = [uid];
    } else if (role === "SuperAdmin") {
      query = base + `
        JOIN users a ON u.admin_id = a.id
        WHERE a.super_admin_id = (SELECT id FROM users WHERE unique_id = $1)
        ORDER BY o.sale_date DESC
      `;
      values = [uid];
    } else {
      return res.status(403).json({ message: "Permission denied." });
    }

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

    const allowed = ["status","sold_amount","number_of_devices","bnpl_platform"];
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
