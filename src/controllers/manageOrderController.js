// src/controllers/manageOrderController.js
const { pool } = require("../config/database");

/**
 * getOrders - Retrieves pending orders created by marketers.
 * Only orders with status "pending" and associated with a user whose role is "Marketer" will be returned.
 * The query also fetches the marketer's unique ID.
 */
const getOrders = async (req, res, next) => {
  try {
    const query = `
      SELECT o.*, u.unique_id AS marketer_unique_id
      FROM orders o
      JOIN users u ON o.marketer_id = u.id
      WHERE o.status = 'pending' AND u.role = 'Marketer'
      ORDER BY o.created_at DESC
    `;
    const result = await pool.query(query);
    res.status(200).json({ orders: result.rows });
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
          confirmed_at = NOW()
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
 * confirmReleasedOrder - Allows Master Admin to confirm that an order released by dealers has been delivered.
 */
const confirmReleasedOrder = async (req, res, next) => {
  try {
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
      return res.status(404).json({ message: "Order not found." });
    }
    res.status(200).json({
      message: "Released order confirmed successfully.",
      order: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getReleasedOrderHistory - Retrieves processed orders' history.
 */
const getReleasedOrderHistory = async (req, res, next) => {
  try {
    const query = `
      SELECT id, status, device_name, device_model, device_type,
             marketer_selling_price, number_of_devices,
             sold_amount, customer_name, customer_phone, customer_address,
             bnpl_platform, sale_date, created_at, confirmed_at, released_confirmed_at
      FROM orders
      WHERE status IN ('released_confirmed', 'confirmed_to_dealer', 'cancelled')
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query);
    res.status(200).json({
      message: "Release order history retrieved successfully.",
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
