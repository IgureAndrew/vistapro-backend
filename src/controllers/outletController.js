// src/controllers/outletController.js
// Controller functions for Outlet module functionalities

const { pool } = require('../config/database');

/**
 * initiateOrderToDealers - Initiates an order to a dealer.
 * Expects details like dealerId, device information, price, and BNPL platform in req.body.
 */
const initiateOrderToDealers = async (req, res, next) => {
  try {
    const { dealerId, deviceName, deviceModel, deviceIMEI, price, bnplPlatform } = req.body;

    const query = `
      INSERT INTO orders (dealer_id, device_name, device_model, device_imei, price, bnpl_platform, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'initiated', NOW())
      RETURNING *
    `;
    const values = [dealerId, deviceName, deviceModel, deviceIMEI, price, bnplPlatform];
    const result = await pool.query(query, values);

    return res.status(201).json({
      message: 'Order initiated successfully',
      order: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * acceptOrderFromMarketers - Accepts an order from a marketer.
 * Expects an orderId in req.body.
 */
const acceptOrderFromMarketers = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const query = `
      UPDATE orders 
      SET status = 'accepted', updated_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;
    const result = await pool.query(query, [orderId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    return res.status(200).json({
      message: 'Order accepted successfully',
      order: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * acceptReturnOrderFromMarketers - Accepts a return order from a marketer.
 * Expects an orderId in req.body.
 */
const acceptReturnOrderFromMarketers = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const query = `
      UPDATE orders 
      SET status = 'returned', updated_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;
    const result = await pool.query(query, [orderId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    return res.status(200).json({
      message: 'Return order accepted successfully',
      order: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * updateDealerStockPickup - Updates the dealer stock pickup information for an order.
 * Expects orderId and dealerStockPickupName in req.body.
 */
const updateDealerStockPickup = async (req, res, next) => {
  try {
    const { orderId, dealerStockPickupName } = req.body;
    const query = `
      UPDATE orders 
      SET dealer_stock_pickup_name = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `;
    const result = await pool.query(query, [dealerStockPickupName, orderId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    return res.status(200).json({
      message: 'Dealer stock pickup updated successfully',
      order: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  initiateOrderToDealers,
  acceptOrderFromMarketers,
  acceptReturnOrderFromMarketers,
  updateDealerStockPickup
};
