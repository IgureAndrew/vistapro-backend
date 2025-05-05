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

// src/controllers/manageOrderController.js
const { pool } = require("../config/database");
const {
  creditMarketerCommission,
  creditAdminCommission,
  creditSuperAdminCommission
} = require("../services/walletService");

async function confirmOrder(req, res, next) {
  const orderId       = parseInt(req.params.orderId, 10);
  const masterAdminId = req.user.unique_id;
  const client        = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Lock & fetch the order
    const { rows: [orderMeta] } = await client.query(`
      SELECT 
        o.id,
        o.marketer_id,
        o.number_of_devices,
        o.stock_update_id,
        o.commission_paid
      FROM orders o
      WHERE o.id = $1
      FOR UPDATE
    `, [orderId]);

    if (!orderMeta) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found." });
    }
    if (orderMeta.commission_paid) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Commission already paid." });
    }

    // 2) Pull device_type for commission rate
    const { rows: [prod] } = await client.query(`
      SELECT
        p.device_type
      FROM orders o
      LEFT JOIN stock_updates su ON o.stock_update_id = su.id
      LEFT JOIN products p       ON p.id = COALESCE(o.product_id, su.product_id)
      WHERE o.id = $1
    `, [orderId]);

    if (!prod || !prod.device_type) {
      throw new Error("Could not determine device type for commission.");
    }
    const deviceType = prod.device_type.toLowerCase();

    // 3) Update order → confirmed + mark commission_paid
    const { rows: [updatedOrder] } = await client.query(`
      UPDATE orders
         SET status          = 'confirmed',
             confirmed_by    = $2,
             confirmed_at    = NOW(),
             commission_paid = TRUE,
             updated_at      = NOW()
       WHERE id = $1
       RETURNING *
    `, [orderId, masterAdminId]);

    // 4) If this was from a stock pickup, move its IMEIs → sold & finish it
    if (orderMeta.stock_update_id) {
      // a) mark reserved IMEIs as sold
      await client.query(`
        UPDATE inventory_items
           SET status = 'sold'
         WHERE stock_update_id = $1
           AND status          = 'reserved'
      `, [orderMeta.stock_update_id]);

      // b) complete the stock_update
      await client.query(`
        UPDATE stock_updates
           SET status       = 'completed',
               updated_at   = NOW()
         WHERE id = $1
      `, [orderMeta.stock_update_id]);
    }

    // 5) Pay out commissions
    //    • Marketer: per-device
    await creditMarketerCommission(
      /* marketerUid */ (await client.query(
          `SELECT unique_id FROM users WHERE id = $1`, 
          [orderMeta.marketer_id]
        )).rows[0].unique_id,
      orderId,
      deviceType,
      orderMeta.number_of_devices
    );

    //    • Admin & SuperAdmin
    await creditAdminCommission(
      (await client.query(
          `SELECT unique_id FROM users WHERE id = $1`,
          [orderMeta.marketer_id]
        )).rows[0].unique_id,
      orderId,
      orderMeta.number_of_devices
    );
    await creditSuperAdminCommission(
      (await client.query(
          `SELECT unique_id FROM users WHERE id = $1`,
          [orderMeta.marketer_id]
        )).rows[0].unique_id,
      orderId,
      orderMeta.number_of_devices
    );

    await client.query("COMMIT");
    res.json({
      message: "Order confirmed; inventory updated; commissions paid.",
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
