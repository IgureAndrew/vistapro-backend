// src/controllers/cashoutController.js
// Controller functions for processing cash outs based on commission rules

const { pool } = require('../config/database');

/**
 * processWeeklyCashout - Processes weekly cash out for a marketer.
 * Calculates the total commission for all unprocessed orders for the given week,
 * where commission is:
 *   - N15,000 for iPhone sales,
 *   - N10,000 for all other (Android) device sales.
 * 40% of the total commission is withdrawable immediately.
 * After processing, marks those orders as commission_processed.
 * Expects marketerId and weekStartDate (YYYY-MM-DD) in req.body.
 */
const processWeeklyCashout = async (req, res, next) => {
  try {
    const { marketerId, weekStartDate } = req.body;
    if (!marketerId || !weekStartDate) {
      return res.status(400).json({ message: 'marketerId and weekStartDate are required.' });
    }

    // Calculate total commission for the week from orders that are not yet processed
    const commissionQuery = `
      SELECT COALESCE(SUM(
        CASE 
          WHEN lower(device_category) = 'iphone' THEN 15000
          ELSE 10000
        END
      ), 0) AS total_commission
      FROM orders
      WHERE marketer_id = $1 
        AND week_start_date = $2 
        AND status = 'released_confirmed'
        AND commission_processed = false
    `;
    const commissionResult = await pool.query(commissionQuery, [marketerId, weekStartDate]);
    const totalCommission = parseFloat(commissionResult.rows[0].total_commission);
    const cashoutAmount = totalCommission * 0.4;

    // Mark these orders as processed for commission
    const updateQuery = `
      UPDATE orders
      SET commission_processed = true
      WHERE marketer_id = $1 
        AND week_start_date = $2 
        AND commission_processed = false
    `;
    await pool.query(updateQuery, [marketerId, weekStartDate]);

    // Record the weekly cashout in the cashouts table
    const insertCashoutQuery = `
      INSERT INTO cashouts (marketer_id, type, amount, processed_at)
      VALUES ($1, 'weekly', $2, NOW())
      RETURNING *
    `;
    const cashoutResult = await pool.query(insertCashoutQuery, [marketerId, cashoutAmount]);

    return res.status(200).json({
      message: 'Weekly cashout processed successfully.',
      cashout: cashoutResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * processMonthlyCashout - Processes monthly cash out for a marketer.
 * For the given month (format 'YYYY-MM'), calculates the commission as follows:
 *   - For every week except the last of the month: 40% of the commission
 *   - For the last week: 100% of the commission
 * Commission is based on:
 *   - N15,000 per iPhone sale and N10,000 per Android sale.
 * After calculation, all unprocessed orders for that month are marked as processed.
 * Expects marketerId and month (format 'YYYY-MM') in req.body.
 */
const processMonthlyCashout = async (req, res, next) => {
  try {
    const { marketerId, month } = req.body;
    if (!marketerId || !month) {
      return res.status(400).json({ message: 'marketerId and month are required.' });
    }

    // Retrieve all unprocessed orders for the given marketer and month, aggregated by week_start_date
    const commissionQuery = `
      SELECT week_start_date,
             COALESCE(SUM(
               CASE 
                 WHEN lower(device_category) = 'iphone' THEN 15000
                 ELSE 10000
               END
             ), 0) AS total_commission
      FROM orders
      WHERE marketer_id = $1
        AND to_char(week_start_date, 'YYYY-MM') = $2
        AND status = 'released_confirmed'
        AND commission_processed = false
      GROUP BY week_start_date
      ORDER BY week_start_date ASC
    `;
    const commissionResult = await pool.query(commissionQuery, [marketerId, month]);
    const rows = commissionResult.rows;
    if (rows.length === 0) {
      return res.status(404).json({ message: 'No unprocessed commissions found for the specified month.' });
    }

    let cashoutAmount = 0;
    // Apply 40% commission for all weeks except the last week of the month
    for (let i = 0; i < rows.length - 1; i++) {
      cashoutAmount += parseFloat(rows[i].total_commission) * 0.4;
    }
    // For the last week, apply 100% commission (i.e. withhold until approved)
    cashoutAmount += parseFloat(rows[rows.length - 1].total_commission);

    // Mark all orders for the month as processed for commission
    const updateQuery = `
      UPDATE orders
      SET commission_processed = true
      WHERE marketer_id = $1
        AND to_char(week_start_date, 'YYYY-MM') = $2
        AND commission_processed = false
    `;
    await pool.query(updateQuery, [marketerId, month]);

    // Record the monthly cashout in the cashouts table
    const insertCashoutQuery = `
      INSERT INTO cashouts (marketer_id, type, amount, processed_at)
      VALUES ($1, 'monthly', $2, NOW())
      RETURNING *
    `;
    const cashoutResult = await pool.query(insertCashoutQuery, [marketerId, cashoutAmount]);

    return res.status(200).json({
      message: 'Monthly cashout processed successfully.',
      cashout: cashoutResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * toggleCashout - Enables or disables cash out for a specific type (weekly or monthly).
 * Expects type (either 'weekly' or 'monthly') and enabled (boolean) in req.body.
 * Only accessible to MasterAdmin.
 */
const toggleCashout = async (req, res, next) => {
  try {
    const { type, enabled } = req.body;
    if (!type || typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'type and enabled (boolean) are required.' });
    }
    // Update the cashout setting in the cashout_settings table.
    const query = `
      UPDATE cashout_settings
      SET enabled = $1, updated_at = NOW()
      WHERE type = $2
      RETURNING *
    `;
    const result = await pool.query(query, [enabled, type]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Cashout setting not found for the specified type.' });
    }

    return res.status(200).json({
      message: `${type} cashout setting updated successfully.`,
      setting: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  processWeeklyCashout,
  processMonthlyCashout,
  toggleCashout
};
