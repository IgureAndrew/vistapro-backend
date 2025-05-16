// src/controllers/manageOrderController.js

const { pool } = require("../config/database");
const walletService = require("../services/walletService");
const {
  creditMarketerCommission,
  creditAdminCommission,
  creditSuperAdminCommission
} = require("../services/walletService");


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


// src/controllers/manageOrderController.js

async function confirmOrder(req, res, next) {
  const { orderId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1) Lock & fetch the order row
    const { rows: [order] } = await client.query(`
      SELECT
        marketer_id,
        product_id,
        stock_update_id,
        number_of_devices,
        commission_paid
      FROM orders
      WHERE id = $1
      FOR UPDATE
    `, [orderId]);
    if (!order) throw new Error("Order not found");

    let {
      product_id,
      stock_update_id,
      commission_paid
    } = order;

    // 2) Pay commissions if not already done
    if (!commission_paid) {
      // … your walletService.creditXXXCommission calls here …
      await client.query(`
        UPDATE orders
           SET commission_paid = TRUE
         WHERE id = $1
      `, [orderId]);
    }

    // 3) Mark the order confirmed
    await client.query(`
      UPDATE orders
         SET status       = 'released_confirmed',
             confirmed_at = NOW(),
             updated_at   = NOW()
       WHERE id = $1
    `, [orderId]);

    // 4) If it was a stock pickup, mark that stock sold
    if (stock_update_id) {
      await client.query(`
        UPDATE stock_updates
           SET status     = 'sold',
               updated_at = NOW()
         WHERE id = $1
      `, [stock_update_id]);
    }

    // 4.5) If product_id was NULL, look it up from stock_updates
    if (!product_id && stock_update_id) {
      const { rows: [su] } = await client.query(`
        SELECT product_id
          FROM stock_updates
         WHERE id = $1
      `, [stock_update_id]);
      if (!su) throw new Error("Stock update record not found");
      product_id = su.product_id;
    }

    // 5) For each order_item, insert into sales_record
    const { rows: items } = await client.query(`
      SELECT
        oi.id          AS order_item_id,
        ii.product_id
      FROM order_items oi
      JOIN inventory_items ii
        ON oi.inventory_item_id = ii.id
      WHERE oi.order_id = $1
    `, [orderId]);

    for (const { order_item_id, product_id: pid } of items) {
      // determine real product_id
      let realPid = pid;
      if (!realPid && stock_update_id) {
        const { rows: [su] } = await client.query(
          `SELECT product_id FROM stock_updates WHERE id = $1`,
          [stock_update_id]
        );
        realPid = su.product_id;
      }

      // each order_item is one unit
      const q = 1;

      // insert into sales_record
      await client.query(`
        INSERT INTO sales_record (
          order_item_id,
          product_id,
          sale_date,
          quantity_sold,
          initial_profit
        ) VALUES (
          $1, $2, NOW(), $3,
          (
            SELECT (selling_price - cost_price) * $3
              FROM products
             WHERE id = $2
          )::NUMERIC(14,2)
        )
      `, [order_item_id, realPid, q]);
    }

    await client.query('COMMIT');
    res.json({
      message: "Order confirmed, commissions paid, stock marked sold, and sales recorded."
    });

  } catch (err) {
    await client.query('ROLLBACK');
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
