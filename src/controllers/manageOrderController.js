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
 * (MasterAdmin only) List pending orders with device info and IMEIs
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

        -- include the product details for pending orders
        p.device_name,
        p.device_model,
        p.device_type,

        -- aggregate any IMEIs, if present
        COALESCE(
          ARRAY_AGG(iv.imei ORDER BY iv.id) FILTER (WHERE iv.imei IS NOT NULL),
          ARRAY[]::text[]
        ) AS imeis
      FROM orders o
      JOIN users m     ON m.id = o.marketer_id
      LEFT JOIN products p     ON p.id = o.product_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN inventory_items iv
            ON iv.id = oi.inventory_item_id
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
 * MasterAdmin confirms an order (stock or free), marks stock sold,
 * and credits all commissions via walletService.
 */


// src/controllers/manageOrderController.js
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

      // ★ Persist the resolved product_id back onto the order ★
      await client.query(`
        UPDATE orders
           SET product_id = $1
         WHERE id = $2
      `, [product_id, orderId]);
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

    // 5) Pay commissions and record sale exactly once
    if (!commission_paid) {
      await creditMarketerCommission(marketerUid, orderId, deviceType, qty);
      await creditAdminCommission(     marketerUid, orderId,          qty);
      await creditSuperAdminCommission(marketerUid, orderId,          qty);

      await client.query(`
        INSERT INTO sales_record (
          order_id,
          product_id,
          sale_date,
          quantity_sold,
          initial_profit
        ) VALUES (
          $1, $2, NOW(), $3::integer,
          (
            SELECT (selling_price - cost_price) * $3::integer
              FROM products
             WHERE id = $2
          )::NUMERIC(14,2)
        )
      `, [orderId, product_id, qty]);

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

    await client.query("COMMIT");
    res.json({
      message:
        "Order released_confirmed, product_id persisted, commissions & sale recorded once, stock marked sold."
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
 * List all (pending+confirmed) orders with device info and IMEIs,
 * filtered by adminId or superAdminId if provided in query.
 */
async function getOrderHistory(req, res, next) {
  try {
    // build dynamic WHERE clauses for Admin/SuperAdmin filters
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

    const sql = `
      SELECT
        o.id,
        o.bnpl_platform,
        o.number_of_devices,
        o.sold_amount,
        o.sale_date,
        o.status,

        -- Marketer name
        m.first_name || ' ' || m.last_name AS marketer_name,

        -- Device info from the original product
        p.device_name,
        p.device_model,
        p.device_type,

        -- Aggregate any IMEIs (if the order has been assigned inventory_items)
        COALESCE(
          ARRAY_AGG(ii.imei ORDER BY ii.id) FILTER (WHERE ii.imei IS NOT NULL),
          ARRAY[]::text[]
        ) AS imeis

      FROM orders o

      JOIN users    m  ON o.marketer_id = m.id
      JOIN products p  ON o.product_id  = p.id

      -- TURN THESE INTO LEFT JOINs so that free‐mode or just‐placed orders still appear
      LEFT JOIN order_items    oi ON oi.order_id          = o.id
      LEFT JOIN inventory_items ii ON ii.id               = oi.inventory_item_id

      -- join through the hierarchy for Admin / SuperAdmin filtering
      JOIN users a  ON m.admin_id       = a.id
      JOIN users s  ON a.super_admin_id = s.id

      ${where}

      GROUP BY
        o.id,
        m.first_name, m.last_name,
        p.device_name, p.device_model, p.device_type

      ORDER BY o.sale_date DESC
    `;

    const { rows } = await pool.query(sql, params);
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


async function cancelOrder(req, res, next) {
  const rawId = req.params.orderId;
  const orderId = parseInt(rawId, 10);

  // 1) Validate
  if (Number.isNaN(orderId)) {
    return res.status(400).json({ message: "Invalid order ID." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2) Fetch the order and make sure it's pending
    const { rows: ordRows } = await client.query(
      `SELECT status, stock_update_id, number_of_devices, product_id
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

    // 3) Restore inventory
    if (order.stock_update_id) {
      // It was a reserved‐stock pickup → release the reserved IMEIs
      await client.query(
        `UPDATE inventory_items
            SET status = 'available',
                stock_update_id = NULL
          WHERE stock_update_id = $1`,
        [order.stock_update_id]
      );
      // Optionally you could also reset the stock_update status back to pending
      await client.query(
        `UPDATE stock_updates
            SET status = 'pending',
                updated_at = NOW()
          WHERE id = $1`,
        [order.stock_update_id]
      );
    } else {
      // It was a free‐mode order → bump the product quantity back
      await client.query(
        `UPDATE products
            SET quantity   = quantity + $1,
                updated_at = NOW()
          WHERE id = $2`,
        [order.number_of_devices, order.product_id]
      );
    }

    // 4) Mark the order canceled
    const { rows: updRows } = await client.query(
      `UPDATE orders
          SET status     = 'canceled',
              updated_at = NOW()
        WHERE id = $1
      RETURNING *`,
      [orderId]
    );

    await client.query('COMMIT');
    return res.json({
      message: "Order canceled and inventory restored.",
      order: updRows[0]
    });
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
