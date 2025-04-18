// src/controllers/walletController.js
const { pool } = require('../config/database');

/**
 * Marketer requests a withdrawal (up to their available_balance).
 */
async function requestWithdrawal(req, res, next) {
  try {
    const userUniqueId = req.user.unique_id;
    const { amount } = req.body;

    // 1) Check available balance
    const { rows } = await pool.query(
      `SELECT available_balance FROM wallets WHERE user_unique_id = $1`,
      [userUniqueId]
    );
    if (!rows.length || rows[0].available_balance < amount) {
      return res.status(400).json({ message: 'Insufficient funds.' });
    }

    // 2) Deduct from available_balance
    await pool.query(
      `UPDATE wallets
         SET available_balance = available_balance - $1,
             updated_at        = NOW()
       WHERE user_unique_id = $2`,
      [amount, userUniqueId]
    );

    // 3) Create the withdrawal request
    const result = await pool.query(
      `INSERT INTO withdrawal_requests (user_unique_id, amount)
       VALUES ($1, $2)
       RETURNING *`,
      [userUniqueId, amount]
    );

    res.status(201).json({ request: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * MasterAdmin: list all pending withdrawal requests.
 */
async function listWithdrawalRequests(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT wr.*, u.first_name, u.last_name
        FROM withdrawal_requests wr
        JOIN users u ON u.unique_id = wr.user_unique_id
       WHERE wr.status = 'pending'
       ORDER BY wr.created_at DESC
    `);
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * MasterAdmin: approve or reject a withdrawal request.
 */
async function reviewWithdrawalRequest(req, res, next) {
  try {
    const { reqId } = req.params;
    const { action } = req.body; // 'approve' or 'reject'

    // 1) Fetch the pending request
    const { rows } = await pool.query(
      `SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'pending'`,
      [reqId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Not found or already reviewed.' });
    }
    const reqRow = rows[0];
    const adminId = req.user.unique_id;

    if (action === 'approve') {
      // a) Debit total_balance
      await pool.query(
        `UPDATE wallets
            SET total_balance = total_balance - $1,
                updated_at    = NOW()
          WHERE user_unique_id = $2`,
        [reqRow.amount, reqRow.user_unique_id]
      );

      // b) Log transaction
      await pool.query(
        `INSERT INTO wallet_transactions (user_unique_id, amount, transaction_type)
         VALUES ($1, -$2, 'withdraw_approved')`,
        [reqRow.user_unique_id, reqRow.amount]
      );

      // c) Mark request approved
      await pool.query(
        `UPDATE withdrawal_requests
            SET status      = 'approved',
                reviewed_by = $1,
                reviewed_at = NOW()
          WHERE id = $2`,
        [adminId, reqId]
      );
    } else {
      // Rejected: refund available_balance
      await pool.query(
        `UPDATE wallets
            SET available_balance = available_balance + $1,
                updated_at        = NOW()
          WHERE user_unique_id = $2`,
        [reqRow.amount, reqRow.user_unique_id]
      );

      // Mark request rejected
      await pool.query(
        `UPDATE withdrawal_requests
            SET status      = 'rejected',
                reviewed_by = $1,
                reviewed_at = NOW()
          WHERE id = $2`,
        [adminId, reqId]
      );
    }

    res.json({ message: `Withdrawal ${action}d.` });
  } catch (err) {
    next(err);
  }
}

/**
 * Marketer: get their wallet summary + recent transactions.
 */
async function getMyWallet(req, res, next) {
  try {
    const userUniqueId = req.user.unique_id;

    const { rows: walletRows } = await pool.query(
      `SELECT
         total_balance,
         available_balance,
         withheld_balance,
         created_at,
         updated_at
       FROM wallets
      WHERE user_unique_id = $1`,
      [userUniqueId]
    );
    if (!walletRows.length) {
      return res.status(404).json({ message: 'Wallet not found.' });
    }
    const wallet = walletRows[0];

    const { rows: txs } = await pool.query(
      `SELECT *
         FROM wallet_transactions
        WHERE user_unique_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [userUniqueId]
    );

    res.json({ wallet, transactions: txs });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requestWithdrawal,
  listWithdrawalRequests,
  reviewWithdrawalRequest,
  getMyWallet,
};
