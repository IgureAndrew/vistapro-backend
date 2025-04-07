// src/controllers/manageOrderController.js
const { pool } = require("../config/database");

/**
 * getOrders - Retrieves orders placed by a marketer that are still pending confirmation.
 * Uses the marketer's unique ID (req.user.unique_id) to fetch orders.
 */
const getOrders = async (req, res, next) => {
  try {
    // Retrieve the marketer's unique identifier from the authenticated request.
    const marketerUniqueId = req.user.unique_id;

    // Join orders with users so that we can filter orders by the marketer's unique ID.
    const query = `
      SELECT o.*
      FROM orders o
      JOIN users u ON o.marketer_id = u.id
      WHERE u.unique_id = $1 AND o.status = 'pending'
      ORDER BY o.created_at DESC
    `;
    const values = [marketerUniqueId];
    const result = await pool.query(query, values);

    res.status(200).json({ orders: result.rows });
  } catch (error) {
    next(error);
  }
};

/**
 * confirmOrderToDealer - Allows Master Admin to confirm an order for dealers.
 * This updates the order's status to "confirmed_to_dealer" and sets a confirmation timestamp.
 */
const confirmOrderToDealer = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const query = `
      UPDATE orders
      SET status = 'confirmed_to_dealer',
          confirmed_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [orderId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    res.status(200).json({
      message: 'Order confirmed to dealer successfully.',
      order: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * confirmReleasedOrder - Allows Master Admin to confirm that an order released by dealers
 * has been successfully delivered. It updates the status to "released_confirmed" and records the timestamp.
 */
const confirmReleasedOrder = async (req, res, next) => {
  try {
    // Only allow Master Admin to confirm released orders.
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only Master Admin can confirm released orders." });
    }
    const orderId = req.params.id;
    const query = `
      UPDATE orders
      SET status = 'released_confirmed',
          released_confirmed_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [orderId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    res.status(200).json({
      message: 'Released order confirmed successfully.',
      order: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getReleasedOrderHistory - Retrieves the history of orders that have been processed.
 * This includes orders with statuses such as "released_confirmed", "confirmed_to_dealer", or "cancelled",
 * along with their date and time details for reconciliation.
 */
const getReleasedOrderHistory = async (req, res, next) => {
  try {
    const query = `
      SELECT id, status, device_name, device_model, device_type,
             dealer_cost_price, marketer_selling_price, number_of_devices,
             sold_amount, customer_name, customer_phone, customer_address,
             bnpl_platform, sale_date, created_at, confirmed_at, released_confirmed_at
      FROM orders
      WHERE status IN ('released_confirmed', 'confirmed_to_dealer', 'cancelled')
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query);
    res.status(200).json({
      message: 'Release order history retrieved successfully.',
      orders: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrders,
  confirmOrderToDealer,
  confirmReleasedOrder,
  getReleasedOrderHistory,
};
