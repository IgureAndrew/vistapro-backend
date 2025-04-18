// src/controllers/manageOrderController.js
const { pool } = require("../config/database");

/**
 * getOrders - Retrieves pending orders created by marketers.
 * If you want to show *all* orders (not just pending) in your marketer dashboard,
 * remove the `o.status = 'pending'` clause here.
 */
async function getOrders(req, res, next) {
  try {
    const userId = req.user.id;
  const { rows } = await pool.query(`
    SELECT o.*, u.unique_id AS marketer_unique_id
     FROM orders o
     JOIN users u ON o.marketer_id = u.id
     WHERE o.status = 'pending' AND u.role = 'Marketer'
  ORDER BY o.created_at DESC`, );
  
    res.json({ orders: rows });
  } catch (err) { next(err) }
}
/**
 * confirmOrder - Confirms a pending order, splits the commission 40/60,
 * updates the marketer’s wallet, and logs two wallet transactions.
 */
const confirmOrder = async (req, res, next) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ message: "Order ID is required." });
  }

  try {
    // 0️⃣ Fetch & validate the order
    const orderRes = await pool.query(`
      SELECT
        o.*,
        u.unique_id AS marketer_unique_id
      FROM orders o
      JOIN users u
        ON o.marketer_id = u.id
      WHERE o.id = $1
    `, [orderId]);
    
    if (orderRes.rowCount === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    
    const order = orderRes.rows[0];
    
    // make sure you still check if it was already confirmed…
    if (order.status === "confirmed") {
      return res.status(400).json({ message: "Order is already confirmed." });
    }
    // 1️⃣ Determine per‑device commission
    const type = order.device_type.toLowerCase();
    const perDevice = type === "android"
      ? 10000
      : type === "iphone"
        ? 15000
        : null;
    if (perDevice === null) {
      return res.status(400).json({ message: "Invalid device type." });
    }

    // split 40% withdrawable / 60% withheld
    const withdrawable = Math.floor(perDevice * 0.4);
    const withheld     = perDevice - withdrawable;

    // 2️⃣ Update the order: mark confirmed & store per‑device rate
    const updateOrderRes = await pool.query(
      `
      UPDATE orders
         SET status              = 'confirmed',
             earnings_per_device = $1,
             confirmed_at        = NOW(),
             updated_at          = NOW()
       WHERE id = $2
       RETURNING *
      `,
      [perDevice, orderId]
    );
    const updatedOrder = updateOrderRes.rows[0];

    // 3️⃣ Credit the marketer’s wallet
    await pool.query(
      `
      UPDATE wallets
         SET total_balance     = total_balance     + $1,
             available_balance = available_balance + $2,
             withheld_balance  = withheld_balance  + $3,
             updated_at        = NOW()
       WHERE user_unique_id = $4
      `,
      [ perDevice, withdrawable, withheld, order.marketer_unique_id ]
    );

    // 4️⃣ Log two wallet transactions: one for withdrawable, one for withheld
    const meta = JSON.stringify({
      order_unique_id: order.unique_id,
      device_type:     order.device_type,
    });
    await pool.query(
      `
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type, meta)
      VALUES
        ($1, $2, 'commission', $3::jsonb),
        ($1, $4, 'withheld',   $3::jsonb)
      `,
      [
        order.marketer_unique_id,
        withdrawable,
        meta,
        withheld,
      ]
    );
    const io = req.app.get("io");
    io.to(`marketer:${order.marketer_unique_id}`)
    .emit("order-updated", updatedOrder);

    res.status(200).json({
      message: "Order confirmed and wallet credited.",
      order:   updatedOrder,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * confirmOrderToDealer - Confirms an order on the dealer side.
 */
const confirmOrderToDealer = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const { rows } = await pool.query(
      `
      UPDATE orders
         SET status       = 'confirmed_to_dealer',
             confirmed_at = NOW(),
             updated_at   = NOW()
       WHERE id = $1
       RETURNING *
      `,
      [orderId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    res.status(200).json({
      message: "Order confirmed to dealer successfully.",
      order:   rows[0],
    });
  } catch (err) {
    next(err);
  }
};

/**
 * getOrderHistory - Returns all orders visible to MasterAdmin, SuperAdmin or Admin.
 */
const getOrderHistory = async (req, res, next) => {
  try {
    const { unique_id: userUniqueId, role } = req.user;
    let query, values = [];

    if (role === "MasterAdmin") {
      query = `
        SELECT o.*, u.unique_id AS marketer_unique_id
          FROM orders o
          JOIN users u ON o.marketer_id = u.id
         WHERE u.role = 'Marketer'
      `;
    } else if (role === "SuperAdmin") {
      query = `
        SELECT o.*, u.unique_id AS marketer_unique_id, a.unique_id AS admin_unique_id
          FROM orders o
          JOIN users u ON o.marketer_id = u.id
          JOIN users a ON u.admin_id = a.id
         WHERE a.super_admin_id = (
           SELECT id FROM users WHERE unique_id = $1
         )
      `;
      values = [userUniqueId];
    } else if (role === "Admin") {
      query = `
        SELECT o.*, u.unique_id AS marketer_unique_id
          FROM orders o
          JOIN users u ON o.marketer_id = u.id
         WHERE u.admin_id = (
           SELECT id FROM users WHERE unique_id = $1
         )
      `;
      values = [userUniqueId];
    } else {
      return res.status(403).json({ message: "Permission denied." });
    }

    query += " ORDER BY o.created_at DESC";
    const { rows } = await pool.query(query, values);
    res.status(200).json({ orders: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * updateOrder – MasterAdmin only
 */
const updateOrder = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only Master Admin can update orders." });
    }
    const { orderId, updatedData } = req.body;
    if (!orderId || !updatedData) {
      return res.status(400).json({ message: "orderId and updatedData are required." });
    }

    const setClauses = [];
    const values     = [];
    let   i          = 1;

    for (const key in updatedData) {
      setClauses.push(`${key} = $${i}`);
      values.push(updatedData[key]);
      i++;
    }
    values.push(orderId);

    const { rows } = await pool.query(
      `
      UPDATE orders
         SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${i}
       RETURNING *
      `,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    res.status(200).json({ message: "Order updated.", order: rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * deleteOrder – MasterAdmin only
 */
const deleteOrder = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only Master Admin can delete orders." });
    }
    const orderId = req.params.id;
    const { rows } = await pool.query(
      "DELETE FROM orders WHERE id = $1 RETURNING *",
      [orderId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    res.status(200).json({ message: "Order deleted.", order: rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getOrders,
  confirmOrder,
  confirmOrderToDealer,
  getOrderHistory,
  updateOrder,
  deleteOrder,
};
