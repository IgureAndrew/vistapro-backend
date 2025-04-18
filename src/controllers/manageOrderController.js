// src/controllers/manageOrderController.js
const { pool } = require("../config/database");

/**
 * getOrders - Retrieves pending orders created by marketers.
 * 
 * By default, it returns all orders with status "pending" for users with the role "Marketer",
 * including the marketer's unique id, full name, and location.
 * If an "orderId" query parameter is provided, it will further filter results to that specific order.
 */
/**
 * getOrders - Retrieves pending orders created by marketers.
 */
const getOrders = async (req, res, next) => {
  try {
    let query = `
      SELECT o.*,
             u.unique_id AS marketer_unique_id,
             (u.first_name || ' ' || u.last_name) AS marketer_name,
             u.location AS marketer_location
      FROM orders o
      JOIN users u ON o.marketer_id = u.id
      WHERE o.status = 'pending' AND u.role = 'Marketer'
    `;
    const values = [];

    if (req.query.orderId) {
      query += " AND o.id = $1";
      values.push(req.query.orderId);
    }

    query += " ORDER BY o.created_at DESC";
    const result = await pool.query(query, values);
    res.status(200).json({ orders: result.rows });
  } catch (error) {
    next(error);
  }
};

/**
 * confirmOrder - Confirms a pending order, awards commission,
 * updates wallet balances, and records wallet transactions.
 */
const confirmOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    // …fetch & validate order…

    // 1️⃣ Determine per‐device commission
    const type = order.device_type.toLowerCase();
    const perDevice = type === "android" ? 10000 : type === "iphone" ? 15000
                      : (() => { throw new Error("Invalid device type"); })();
    // split 40/60
    const withdrawable = Math.floor(perDevice * 0.4);
    const withheld    = perDevice - withdrawable;

    // 2️⃣ Update order status & record per‑device commission
    const updatedRes = await pool.query(
      `UPDATE orders
         SET status              = 'confirmed',
             earnings_per_device = $1,
             confirmed_at        = NOW(),
             updated_at          = NOW()
       WHERE id = $2
       RETURNING *`,
      [perDevice, orderId]
    );

    // 3️⃣ Credit the marketer’s wallet
    await pool.query(
      `UPDATE wallets
          SET total_balance     = total_balance     + $1,
              available_balance = available_balance + $2,
              withheld_balance  = withheld_balance  + $3,
              updated_at        = NOW()
        WHERE user_unique_id = $4`,
      [ perDevice, withdrawable, withheld,         order.marketer_unique_id ]
    );

    // 4️⃣ Log two wallet transactions
    await pool.query(
      `INSERT INTO wallet_transactions
         (user_unique_id, amount, transaction_type, meta)
       VALUES
         ($1, $2, 'commission', $3::jsonb),
         ($1, $4, 'withheld',   $3::jsonb)`,
      [
        order.marketer_unique_id,
        withdrawable,
        JSON.stringify({
          order_unique_id: order.unique_id,
          device_type:     order.device_type,
        }),
        withheld,
      ]
    );

    res.status(200).json({
      message: "Order confirmed and wallet credited.",
      order: updatedRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

/**
 * confirmOrderToDealer - Allows Master Admin to confirm an order for dealers.
 */
const confirmOrderToDealer = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const { rows } = await pool.query(
      `UPDATE orders
          SET status       = 'confirmed_to_dealer',
              confirmed_at = NOW(),
              updated_at   = NOW()
        WHERE id = $1
        RETURNING *`,
      [orderId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    res.status(200).json({
      message: "Order confirmed to dealer successfully.",
      order: rows[0]
    });
  } catch (error) {
    next(error);
  }
};
/**
 * getOrderHistory - Retrieves the order history based on the logged-in user's role.
 * For:
 *  - Master Admin: Returns all orders from marketers.
 *  - SuperAdmin: Returns orders for marketers whose assigned admin's super_admin_id matches the logged-in superadmin.
 *  - Admin: Returns orders for only those marketers assigned to the logged-in admin.
 * The filtering uses the logged in user's unique ID.
 */
const getOrderHistory = async (req, res, next) => {
  try {
    const userUniqueId = req.user.unique_id;
    const role = req.user.role; // "MasterAdmin", "SuperAdmin", or "Admin"
    let query = "";
    let values = [];

    if (role === "MasterAdmin") {
      // Master Admin sees all orders from marketers.
      query = `
        SELECT o.*, u.unique_id AS marketer_unique_id
        FROM orders o
        JOIN users u ON o.marketer_id = u.id
        WHERE u.role = 'Marketer'
        ORDER BY o.created_at DESC
      `;
    } else if (role === "SuperAdmin") {
      // SuperAdmin: See orders for marketers whose assigned admin's super_admin_id equals the superadmin's internal id.
      query = `
        SELECT o.*, u.unique_id AS marketer_unique_id, a.unique_id AS admin_unique_id
        FROM orders o
        JOIN users u ON o.marketer_id = u.id
        JOIN users a ON u.admin_id = a.id
        WHERE a.super_admin_id = (
          SELECT id FROM users WHERE unique_id = $1
        )
        ORDER BY o.created_at DESC
      `;
      values = [userUniqueId];
    } else if (role === "Admin") {
      // Admin: See only orders for marketers assigned to this admin.
      query = `
        SELECT o.*, u.unique_id AS marketer_unique_id
        FROM orders o
        JOIN users u ON o.marketer_id = u.id
        WHERE u.admin_id = (
          SELECT id FROM users WHERE unique_id = $1
        )
        ORDER BY o.created_at DESC
      `;
      values = [userUniqueId];
    } else {
      return res.status(403).json({ message: "You do not have permission to view order history." });
    }

    const result = await pool.query(query, values);
    res.status(200).json({ orders: result.rows });
  } catch (error) {
    next(error);
  }
};

/**
 * updateOrder - Allows only a Master Admin to update any marketer's order details.
 * Expects in req.body:
 *   - orderId: the order ID to update.
 *   - updatedData: an object containing the fields and new values.
 */
const updateOrder = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only Master Admin can update orders." });
    }
    const { orderId, updatedData } = req.body;
    if (!orderId || !updatedData) {
      return res.status(400).json({ message: "Order ID and updated data are required." });
    }

    const setClause = [];
    const values = [];
    let i = 1;
    for (const key in updatedData) {
      setClause.push(`${key} = $${i}`);
      values.push(updatedData[key]);
      i++;
    }
    values.push(orderId); // Append orderId as the final value.
    const query = `
      UPDATE orders
      SET ${setClause.join(", ")}, updated_at = NOW()
      WHERE id = $${i}
      RETURNING *
    `;
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    res.status(200).json({
      message: "Order updated successfully.",
      order: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * deleteOrder - Allows only a Master Admin to delete a marketer's order.
 */
const deleteOrder = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only Master Admin can delete orders." });
    }
    const orderId = req.params.id;
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required." });
    }
    const query = "DELETE FROM orders WHERE id = $1 RETURNING *";
    const result = await pool.query(query, [orderId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    res.status(200).json({
      message: "Order deleted successfully.",
      order: result.rows[0],
    });
  } catch (error) {
    next(error);
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
