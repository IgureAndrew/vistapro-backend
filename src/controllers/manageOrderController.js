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
 * MasterAdmin confirms an order (stock or free), marks stock sold,
 * and credits all commissions via walletService.
 */
async function confirmOrder(req, res, next) {
  const { orderId } = req.params;
  const adminUid    = req.user.unique_id;
  const client      = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Lock & fetch the order
    const { rows: orderRows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (!orderRows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found." });
    }
    const order = orderRows[0];
    const qty   = order.number_of_devices;

    // 2) If this was a stock pickup, mark reserved IMEIs sold & flip pickup to sold
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

    // 3) Confirm the order
    const { rows: updatedRows } = await client.query(
      `UPDATE orders
          SET status       = 'confirmed',
              confirmed_by = $2,
              confirmed_at = NOW(),
              updated_at   = NOW()
        WHERE id = $1
        RETURNING *`,
      [orderId, adminUid]
    );
    const updatedOrder = updatedRows[0];

    // 4) Look up hierarchy: marketer → admin → super-admin
    const { rows: mRows } = await client.query(
      `SELECT unique_id, admin_id
         FROM users
        WHERE id = $1`,
      [order.marketer_id]
    );
    const marketerUid = mRows[0].unique_id;
    const adminId     = mRows[0].admin_id;

    const { rows: aRows } = await client.query(
      `SELECT unique_id, super_admin_id
         FROM users
        WHERE id = $1`,
      [adminId]
    );
    const adminUid2     = aRows[0].unique_id;
    const superAdminId  = aRows[0].super_admin_id;

    const { rows: sRows } = await client.query(
      `SELECT unique_id
         FROM users
        WHERE id = $1`,
      [superAdminId]
    );
    const superUid = sRows[0].unique_id;

    // 5) Determine per-device rates
    const { rows: dRows } = await client.query(
      `SELECT p.device_type
         FROM products p
    LEFT JOIN stock_updates su ON su.product_id = p.id
        WHERE p.id = COALESCE($1, su.product_id)`,
      [order.product_id]
    );
    const dtype = dRows[0].device_type.toLowerCase();
    const marketerRate = dtype === "android" ? 10000 : 15000;
    const adminRate     = 1500;
    const superRate     = 1000;

    const marketerComm = marketerRate * qty;
    const adminComm     = adminRate     * qty;
    const superComm     = superRate     * qty;

    // 6) Upsert into wallets & record transactions
    const upsertWallet = async (uid, amt, txType) => {
      await client.query(
        `INSERT INTO wallets (user_unique_id, total_balance, available_balance, withheld_balance, created_at, updated_at)
         VALUES ($1, $2, $2, 0, NOW(), NOW())
         ON CONFLICT (user_unique_id) DO
           UPDATE SET
             total_balance     = wallets.total_balance + $2,
             available_balance = wallets.available_balance + $2,
             updated_at        = NOW()`,
        [uid, amt]
      );
      await client.query(
        `INSERT INTO wallet_transactions (user_unique_id, amount, transaction_type, meta, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [uid, amt, txType, `order:${orderId}`]
      );
    };

    await upsertWallet(marketerUid, marketerComm, "commission_marketer");
    await upsertWallet(  adminUid2,   adminComm,     "commission_admin");
    await upsertWallet( superUid,     superComm,     "commission_super");

    await client.query("COMMIT");
    res.json({
      message: "Order confirmed; stock marked sold; commissions credited.",
      order: updatedOrder,
      commissions: {
        marketer: marketerComm,
        admin:     adminComm,
        super:     superComm
      }
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
