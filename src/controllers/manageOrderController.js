// src/controllers/manageOrderController.js
const { pool } = require("../config/database");
const {
  creditMarketerCommission,
  creditAdminCommission,
  creditSuperAdminCommission
} = require("../services/walletService");

/**
 * GET /api/manage-orders/orders
 * List only the IMEIs typed in at order time (no reserved‐stock fallout).
 */
async function getPendingOrders(req, res, next) {
  try {
     const { rows } = await pool.query(`
      SELECT
        o.id,
        o.bnpl_platform,
        o.number_of_devices,
        o.sold_amount,
        o.sale_date,
        o.status,
        m.first_name || ' ' || m.last_name AS marketer_name,
        p.device_name,
        p.device_model,
        p.device_type,
        -- no DISTINCT, keep ORDER BY
        COALESCE(
          ARRAY_AGG(ii.imei ORDER BY ii.id)
            FILTER (WHERE ii.imei IS NOT NULL),
          ARRAY[]::text[]
        ) AS imeis
      FROM orders o
      JOIN users m ON m.id = o.marketer_id
      LEFT JOIN products p        ON p.id = o.product_id
      LEFT JOIN order_items oi    ON oi.order_id = o.id
      LEFT JOIN inventory_items ii ON ii.id = oi.inventory_item_id
      WHERE o.status = 'pending'
      GROUP BY
        o.id, m.first_name, m.last_name,
        p.device_name, p.device_model, p.device_type
      ORDER BY o.sale_date DESC
    `);
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/manage-orders/orders/:orderId/confirm
 * Confirm a pending pickup order: record IMEIs sold, update stock,
 * pay commissions, and mark as released_confirmed.
 */
// src/controllers/manageOrderController.js

async function confirmOrder(req, res, next) {
  const orderId = parseInt(req.params.orderId, 10);
  const client  = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Lock & fetch
    const { rows: [o] } = await client.query(`
      SELECT
        marketer_id,
        product_id,
        stock_update_id,
        number_of_devices AS qty,
        commission_paid
      FROM orders
      WHERE id = $1
        AND status = 'pending'
      FOR UPDATE
    `, [orderId]);

    if (!o) {
      throw { status: 404, message: "Order not found or already confirmed." };
    }

    const { marketer_id, stock_update_id, qty, commission_paid } = o;
    let   { product_id } = o;   // note: we’ll reassign if missing

    // 2) Persist product_id if missing
    if (!product_id && stock_update_id) {
      const { rows: [su] } = await client.query(
        `SELECT product_id FROM stock_updates WHERE id = $1`,
        [stock_update_id]
      );
      if (!su) throw { status: 404, message: "Associated stock update not found." };

      await client.query(
        `UPDATE orders SET product_id = $1 WHERE id = $2`,
        [su.product_id, orderId]
      );
      product_id = su.product_id;
    }

    // 3) Pay commissions & record sale (once only)
    if (!commission_paid) {
      // fetch marketer UID
      const { rows: [mu] } = await client.query(
        `SELECT unique_id FROM users WHERE id = $1`,
        [marketer_id]
      );
      const marketerUid = mu.unique_id;

      // fetch device_type
      const { rows: [prd] } = await client.query(
        `SELECT device_type FROM products WHERE id = $1`,
        [product_id]
      );
      const deviceType = prd.device_type;

      // credit commissions
      await creditMarketerCommission(marketerUid, orderId, deviceType, qty);
      await creditAdminCommission    (marketerUid, orderId, qty);
      await creditSuperAdminCommission(marketerUid, orderId, qty);

      // record in sales_record
      await client.query(`
        INSERT INTO sales_record (
          order_id,
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
          )
        )
      `, [orderId, product_id, qty]);

      // mark commissions paid
      await client.query(
        `UPDATE orders SET commission_paid = TRUE WHERE id = $1`,
        [orderId]
      );
    }

    // 4) Mark order released_confirmed
    await client.query(`
      UPDATE orders
         SET status = 'released_confirmed',
             confirmed_at = NOW(),
             updated_at   = NOW()
       WHERE id = $1
    `, [orderId]);

    // 5) Optionally mark the stock_update fully sold
    if (stock_update_id) {
      await client.query(`
        UPDATE stock_updates
           SET status     = 'sold',
               updated_at = NOW()
         WHERE id = $1
      `, [stock_update_id]);
    }

    await client.query("COMMIT");
    res.json({
      message: "Order confirmed, commissions paid & status updated."
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ message: err.message });
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
 * Same logic for history: only pull IMEIs from the user‐entered list.
 */
async function getOrderHistory(req, res, next) {
  try {
    const clauses = [];
    const params  = [];
    if (req.query.adminId) {
      params.push(req.query.adminId);
      clauses.push(`m.admin_id = $${params.length}`);
    }
    if (req.query.superAdminId) {
      params.push(req.query.superAdminId);
      clauses.push(`s.unique_id = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const { rows } = await pool.query(`
      SELECT
        o.id,
        o.bnpl_platform,
        o.number_of_devices,
        o.sold_amount,
        o.sale_date,
        o.status,
        m.first_name || ' ' || m.last_name AS marketer_name,
        p.device_name,
        p.device_model,
        p.device_type,
        ARRAY_AGG(ii.imei ORDER BY ii.id)
          FILTER (WHERE ii.imei IS NOT NULL) AS imeis
      FROM orders o
      JOIN users m          ON m.id = o.marketer_id
      JOIN products p       ON p.id = o.product_id
      LEFT JOIN order_items oi  ON oi.order_id = o.id
      LEFT JOIN inventory_items ii ON ii.id = oi.inventory_item_id
      -- … optional joins for admin/superAdmin …
      GROUP BY
        o.id, m.first_name, m.last_name,
        p.device_name, p.device_model, p.device_type
      ORDER BY o.sale_date DESC
    `, /* your params array */);
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/manage-orders/orders/:orderId
 * Update basic order fields (MasterAdmin only)
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
 * Delete an order (MasterAdmin only)
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

/**
 * GET /api/manage-orders/orders/:orderId/detail
 * Get detailed profit breakdown for a confirmed order
 */
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
        (p.selling_price - p.cost_price) * sr.quantity_sold AS total_profit_before,
        sr.quantity_sold * (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate) AS total_expenses,
        ( (p.selling_price - p.cost_price) * sr.quantity_sold
         - sr.quantity_sold * (cr.marketer_rate + cr.admin_rate + cr.superadmin_rate)
        ) AS total_profit_after
      FROM sales_record sr
      JOIN orders o ON o.id = sr.order_id
      JOIN products p ON p.id = sr.product_id
      JOIN commission_rates cr ON cr.device_type = p.device_type
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

/**
 * PATCH /api/manage-orders/orders/:orderId/cancel
 * Cancel a pending pickup order and restore reserved stock
 */
async function cancelOrder(req, res, next) {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId)) {
    return res.status(400).json({ message: "Invalid order ID." });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch the order
    const { rows: ordRows } = await client.query(
      `SELECT status, stock_update_id, number_of_devices
         FROM orders
        WHERE id = $1`,
      [orderId]
    );
    if (!ordRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Order not found." });
    }
    const order = ordRows[0];
    if (order.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Only pending orders can be canceled." });
    }
    if (!order.stock_update_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Only pickup-based orders can be canceled." });
    }

    // Restore reserved IMEIs
    await client.query(
      `UPDATE inventory_items
          SET status = 'available', stock_update_id = NULL
        WHERE stock_update_id = $1`,
      [order.stock_update_id]
    );
    // Reset stock_update status
    await client.query(
      `UPDATE stock_updates
          SET status = 'pending', updated_at = NOW()
        WHERE id = $1`,
      [order.stock_update_id]
    );

    // Mark the order canceled
    const { rows: updRows } = await client.query(
      `UPDATE orders
          SET status     = 'canceled', updated_at = NOW()
        WHERE id = $1
      RETURNING *`,
      [orderId]
    );

    await client.query('COMMIT');
    res.json({ message: "Order canceled and reserved stock restored.", order: updRows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
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
  cancelOrder,
};
