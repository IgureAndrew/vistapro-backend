// src/controllers/cashoutController.js
// Controller functions for processing cash outs

const { pool } = require('../config/database');

/**
 * processWeeklyCashout - Processes weekly cash out for a marketer.
 * Calculates 40% of the unprocessed incentive amount for the given week.
 * Expects marketerId and weekStartDate (YYYY-MM-DD) in req.body.
 */
const processWeeklyCashout = async (req, res, next) => {
  try {
    const { marketerId, weekStartDate } = req.body;
    if (!marketerId || !weekStartDate) {
      return res.status(400).json({ message: 'marketerId and weekStartDate are required.' });
    }

    // Calculate the total unprocessed incentive for the week for the marketer.
    const incentiveQuery = `
      SELECT COALESCE(SUM(incentive_amount), 0) AS total_incentive
      FROM marketer_incentives
      WHERE marketer_id = $1 AND week_start_date = $2 AND processed = false;
    `;
    const incentiveResult = await pool.query(incentiveQuery, [marketerId, weekStartDate]);
    const totalIncentive = parseFloat(incentiveResult.rows[0].total_incentive);
    const cashoutAmount = totalIncentive * 0.4;

    // Mark these incentives as processed.
    const updateQuery = `
      UPDATE marketer_incentives
      SET processed = true
      WHERE marketer_id = $1 AND week_start_date = $2 AND processed = false;
    `;
    await pool.query(updateQuery, [marketerId, weekStartDate]);

    // Record the cashout in the cashouts table.
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
 * Calculates monthly cash out as:
 *   - 100% of the incentive for the last week of the month, plus
 *   - 40% of the incentives for all previous weeks in the month.
 * Expects marketerId and month (format 'YYYY-MM') in req.body.
 */
const processMonthlyCashout = async (req, res, next) => {
  try {
    const { marketerId, month } = req.body;
    if (!marketerId || !month) {
      return res.status(400).json({ message: 'marketerId and month are required.' });
    }

    // Get all unprocessed incentives for the given month.
    const incentiveQuery = `
      SELECT week_start_date, incentive_amount
      FROM marketer_incentives
      WHERE marketer_id = $1 AND to_char(week_start_date, 'YYYY-MM') = $2 AND processed = false;
    `;
    const incentiveResult = await pool.query(incentiveQuery, [marketerId, month]);
    const incentives = incentiveResult.rows;
    if (incentives.length === 0) {
      return res.status(404).json({ message: 'No unprocessed incentives found for the specified month.' });
    }

    // Sort incentives by week_start_date to determine the last week.
    incentives.sort((a, b) => new Date(a.week_start_date) - new Date(b.week_start_date));
    const lastWeek = incentives[incentives.length - 1];
    let cashoutAmount = 0;
    // For previous weeks, apply 40% of incentive.
    for (let i = 0; i < incentives.length - 1; i++) {
      cashoutAmount += parseFloat(incentives[i].incentive_amount) * 0.4;
    }
    // For the last week, apply 100% of incentive.
    cashoutAmount += parseFloat(lastWeek.incentive_amount);

    // Mark all incentives for the month as processed.
    const updateQuery = `
      UPDATE marketer_incentives
      SET processed = true
      WHERE marketer_id = $1 AND to_char(week_start_date, 'YYYY-MM') = $2 AND processed = false;
    `;
    await pool.query(updateQuery, [marketerId, month]);

    // Record the cashout in the cashouts table.
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
