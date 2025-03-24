// src/controllers/marketerStockController.js
const { pool } = require('../config/database');

/**
 * acceptStockUpdate - Updates stock items held by the marketer for more than 4 days.
 * If any stock items are updated, the function alerts the Master Admin(s) and
 * sends a notification to the marketer.
 */
const acceptStockUpdate = async (req, res, next) => {
  try {
    const marketerId = req.user.id; // The authenticated marketer's ID
    const thresholdInterval = "4 days"; // Changed from 24 hours to 4 days

    // Calculate the cutoff date: current time minus 4 days.
    const cutoffResult = await pool.query(
      `SELECT NOW() - INTERVAL '${thresholdInterval}' AS cutoff`
    );
    const cutoffDate = cutoffResult.rows[0].cutoff;

    // Update unsold stocks held by this marketer that were received before the cutoff date.
    // Assumes the "stocks" table has: user_id, sold_date (NULL if unsold), received_date, status.
    const updateQuery = `
      UPDATE stocks
      SET status = 'returned_to_store',
          updated_at = NOW()
      WHERE user_id = $1
        AND sold_date IS NULL
        AND received_date < $2
        AND status != 'returned_to_store'
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [marketerId, cutoffDate]);

    // If any stocks were updated, send notifications.
    if (result.rows.length > 0) {
      // Retrieve all Master Admin IDs.
      const masterAdminQuery = `SELECT id FROM users WHERE role = 'MasterAdmin'`;
      const masterAdmins = await pool.query(masterAdminQuery);
      const adminIds = masterAdmins.rows.map(row => row.id);

      const notificationMessageForAdmin = `Alert: Marketer with ID ${marketerId} has unsold stock items (held for over 4 days) returned to store. Please review.`;
      // Insert notifications for each Master Admin.
      for (const adminId of adminIds) {
        await pool.query(
          `INSERT INTO notifications (recipient_id, message, created_at) VALUES ($1, $2, NOW())`,
          [adminId, notificationMessageForAdmin]
        );
      }

      // Insert notification for the marketer.
      const notificationMessageForMarketer = `Your unsold stock items (held for over 4 days) have been returned to store. Please review your account for details.`;
      await pool.query(
        `INSERT INTO notifications (recipient_id, message, created_at) VALUES ($1, $2, NOW())`,
        [marketerId, notificationMessageForMarketer]
      );

      return res.status(200).json({
        message: 'Unsold stock held for more than 4 days has been returned to store. Notifications sent.',
        updatedStocks: result.rows
      });
    }

    return res.status(200).json({
      message: "No unsold stock items found for over 4 days.",
      updatedStocks: []
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { acceptStockUpdate };
