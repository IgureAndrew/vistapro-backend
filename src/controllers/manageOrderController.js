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


async function confirmOrder(req, res, next) {
  const { orderId } = req.params;
  const client      = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Fetch & lock the order (including marketer_id)
    const { rows: [o] } = await client.query(`
      SELECT
        marketer_id,
        product_id,
        stock_update_id,
        number_of_devices AS qty,
        commission_paid
      FROM orders
      WHERE id = $1
      FOR UPDATE
    `, [orderId]);
    if (!o) throw new Error("Order not found");

    let { marketer_id, product_id, stock_update_id, qty, commission_paid } = o;

    // 2) Resolve product_id if this was a stock pickup
    if (!product_id && stock_update_id) {
      const { rows: [su] } = await client.query(`
        SELECT product_id
          FROM stock_updates
         WHERE id = $1
      `, [stock_update_id]);
      if (!su) throw new Error("Stock update record not found");
      product_id = su.product_id;
    }

    // 3) Look up device_type for commission rates
    const { rows: [prd] } = await client.query(`
      SELECT device_type
        FROM products
       WHERE id = $1
    `, [product_id]);
    const deviceType = prd.device_type;

    // 4) Look up marketer's unique_id
    const { rows: [mu] } = await client.query(`
      SELECT unique_id
        FROM users
       WHERE id = $1
    `, [marketer_id]);
    const marketerUid = mu.unique_id;

    // 5) Pay commissions if not already done
    if (!commission_paid) {
      await creditMarketerCommission(marketerUid, orderId, deviceType, qty);
      await creditAdminCommission(     marketerUid, orderId,          qty);
      await creditSuperAdminCommission(marketerUid, orderId,          qty);

      await client.query(`
        UPDATE orders
           SET commission_paid = TRUE
         WHERE id = $1
      `, [orderId]);
    }

    // 6) Mark the order confirmed
    await client.query(`
      UPDATE orders
         SET status       = 'released_confirmed',
             confirmed_at = NOW(),
             updated_at   = NOW()
       WHERE id = $1
    `, [orderId]);

    // 7) If it was a stock pickup, mark that stock sold
    if (stock_update_id) {
      await client.query(`
        UPDATE stock_updates
           SET status     = 'sold',
               updated_at = NOW()
         WHERE id = $1
      `, [stock_update_id]);
    }

    // 8) Record the sale in sales_record
    await client.query(`
      INSERT INTO sales_record (
        order_id,
        product_id,
        sale_date,
        quantity_sold,
        initial_profit
      ) VALUES (
        $1,                -- order_id
        $2,                -- product_id
        NOW(),             -- sale_date
        $3::integer,       -- quantity_sold
        (
          SELECT (selling_price - cost_price) * $3::integer
            FROM products
           WHERE id = $2
        )::NUMERIC(14,2)   -- initial_profit
      )
    `, [
      orderId,
      product_id,
      qty
    ]);

    await client.query("COMMIT");
    res.json({
      message: "Order released_confirmed, commissions paid, stock marked sold, and sale recorded."
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

async function getConfirmedOrderDetail(req, res, next) {
  const { orderId } = req.params;
  try {
    const { rows } = await pool.query(
      `
      SELECT
        p.device_name,
        p.device_model,
        p.device_type,
        o.sold_amount     AS selling_price,
        sr.quantity_sold  AS qty,
        -- gross profit before commissions
        (p.selling_price - p.cost_price) * sr.quantity_sold AS total_profit_before,
        -- total expense = qty * (marketer + admin + superadmin)
        sr.quantity_sold *
          (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate)
        AS total_expenses,
        -- net profit
        ((p.selling_price - p.cost_price) * sr.quantity_sold
         - sr.quantity_sold * (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate)
        ) AS total_profit_after
      FROM sales_record sr
      JOIN orders o ON o.id = sr.order_id
      JOIN products p ON p.id = sr.product_id
      JOIN commission_rates cr
        ON cr.device_type = p.device_type
      WHERE sr.order_id = $1
      `,
      [orderId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: "No confirmed sale found for that order." });
    }
    res.json(rows);
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
  getConfirmedOrderDetail,
};
