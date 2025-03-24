const { pool } = require("../config/database");

/**
 * getOrders - Retrieves orders that need confirmation.
 * Optionally, you could filter orders by status.
 */
const getOrders = async (req, res, next) => {
  try {
    const query = `
      SELECT * FROM orders
      WHERE status IN ('pending_confirmation', 'released_pending_confirmation')
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query);
    res.status(200).json({ orders: result.rows });
  } catch (error) {
    next(error);
  }
};

/**
 * confirmOrderToDealer - Allows Master Admin to confirm an order for dealers before release.
 * Updates the order status to "confirmed_to_dealer" and records the confirmation timestamp.
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
    return res.status(200).json({
      message: 'Order confirmed to dealer successfully.',
      order: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * confirmReleasedOrder - Allows Admin (or Master Admin) to confirm that an order released by dealers
 * is successfully delivered.
 * Updates the order status to "released_confirmed" and records the timestamp.
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
      return res.status(404).json({ message: 'Order not found.' });
    }
    return res.status(200).json({
      message: 'Released order confirmed successfully.',
      order: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getReleasedOrderHistory - Retrieves the order history for orders that have been processed.
 * Includes orders with statuses such as "released_confirmed", "confirmed_to_dealer", or "cancelled".
 * Orders are returned with date and time information for reconciliation.
 */
const getReleasedOrderHistory = async (req, res, next) => {
  try {
    const query = `
      SELECT id, status, created_at, confirmed_at, released_confirmed_at
      FROM orders
      WHERE status IN ('released_confirmed', 'confirmed_to_dealer', 'cancelled')
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query);
    return res.status(200).json({
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
