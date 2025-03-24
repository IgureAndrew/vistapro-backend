// src/controllers/dealerOrderController.js
const { pool } = require('../config/database');

/**
 * getOrderList - Retrieves a list of orders associated with the dealer.
 * This list captures device details such as device name, color, model specifications, and device IMEI.
 */
const getOrderList = async (req, res, next) => {
  try {
    const dealerId = req.user.id;
    // Adjust this query based on your orders table schema.
    const query = `
      SELECT id, device_name, color, model_specifications, device_imei, created_at
      FROM orders
      WHERE dealer_id = $1
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [dealerId]);
    return res.status(200).json({
      message: 'Order list retrieved successfully.',
      orders: result.rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * sendReleaseOrderNotice - Allows a dealer to send a release order notice to the admin.
 * Expects orderId and a notice message in req.body.
 */
const sendReleaseOrderNotice = async (req, res, next) => {
  try {
    const dealerId = req.user.id;
    const { orderId, noticeMessage } = req.body;
    if (!orderId || !noticeMessage) {
      return res.status(400).json({ message: 'Order ID and notice message are required.' });
    }
    
    // Update the orders table to record the notice.
    // For example, set a column release_order_notice and a timestamp.
    const query = `
      UPDATE orders
      SET release_order_notice = $1, notice_sent_at = NOW()
      WHERE id = $2 AND dealer_id = $3
      RETURNING *
    `;
    const values = [noticeMessage, orderId, dealerId];
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Order not found or unauthorized.' });
    }
    return res.status(200).json({
      message: 'Release order notice sent successfully.',
      order: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * confirmReleasedOrder - Allows a dealer to confirm that an order has been released by the admin.
 * Expects orderId in req.body.
 */
const confirmReleasedOrder = async (req, res, next) => {
  try {
    const dealerId = req.user.id;
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ message: 'Order ID is required.' });
    }
    
    // Update the order status to indicate the dealer has confirmed the release.
    const query = `
      UPDATE orders
      SET status = 'released_confirmed', confirmed_at = NOW()
      WHERE id = $1 AND dealer_id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [orderId, dealerId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Order not found or unauthorized.' });
    }
    return res.status(200).json({
      message: 'Order release confirmed successfully.',
      order: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getReleaseOrderHistory - Retrieves the history of orders that have been released (and confirmed) by the dealer.
 */
const getReleaseOrderHistory = async (req, res, next) => {
  try {
    const dealerId = req.user.id;
    // Adjust this query based on your orders table; here we assume status 'released_confirmed' indicates finalized orders.
    const query = `
      SELECT id, device_name, color, model_specifications, device_imei, confirmed_at, created_at
      FROM orders
      WHERE dealer_id = $1 AND status = 'released_confirmed'
      ORDER BY confirmed_at DESC
    `;
    const result = await pool.query(query, [dealerId]);
    return res.status(200).json({
      message: 'Release order history retrieved successfully.',
      orders: result.rows
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrderList,
  sendReleaseOrderNotice,
  confirmReleasedOrder,
  getReleaseOrderHistory,
};
