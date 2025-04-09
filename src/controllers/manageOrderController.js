// src/controllers/manageOrderController.js
const { pool } = require("../config/database");

/**
 * getOrders - Retrieves pending orders created by marketers.
 * 
 * By default, it returns all orders with status "pending" for users with the role "Marketer",
 * including the marketer's unique id, full name, and location.
 * If an "orderId" query parameter is provided, it will further filter results to that specific order.
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
    
    // If an orderId is provided in the query string, add a filter.
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
 * confirmOrder - Allows the Master Admin to confirm a pending order.
 * Upon confirmation, the order's status is updated to "confirmed", and earnings are calculated:
 *   - For Android devices: N10,000 per device.
 *   - For iPhone devices: N15,000 per device.
 * Total earnings = rate * number_of_devices.
 */
const confirmOrder = async (req, res, next) => {
  try {
    // Get the order ID from the request body.
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    // Retrieve the order record.
    const orderResult = await pool.query("SELECT * FROM orders WHERE id = $1", [orderId]);
    if (orderResult.rowCount === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    const order = orderResult.rows[0];

    // Prevent confirming an already confirmed order.
    if (order.status && order.status.toLowerCase() === "confirmed") {
      return res.status(400).json({ message: "Order is already confirmed." });
    }

    // Determine the per-device earning based on device_type.
    let perDeviceEarning;
    if (order.device_type.toLowerCase() === "android") {
      perDeviceEarning = 10000;
    } else if (order.device_type.toLowerCase() === "iphone") {
      perDeviceEarning = 15000;
    } else {
      return res.status(400).json({ message: "Invalid device type." });
    }

    // Calculate total earnings.
    const totalEarnings = perDeviceEarning * Number(order.number_of_devices);

    // Update the order: change status to "confirmed", record earnings and confirmed_at.
    const updateQuery = `
      UPDATE orders
      SET status = 'confirmed',
          earnings = $1,
          confirmed_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const updateValues = [totalEarnings, orderId];
    const updatedOrderResult = await pool.query(updateQuery, updateValues);

    res.status(200).json({
      message: "Order confirmed successfully.",
      order: updatedOrderResult.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * confirmOrderToDealer - Allows Master Admin to confirm an order for dealers.
 */
const confirmOrderToDealer = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const query = `
      UPDATE orders
      SET status = 'confirmed_to_dealer',
          confirmed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [orderId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    res.status(200).json({
      message: "Order confirmed to dealer successfully.",
      order: result.rows[0],
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
