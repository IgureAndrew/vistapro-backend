// src/controllers/walletController.js
const { pool } = require('../config/database');

/**
 * Credit commission when MasterAdmin confirms a sale.
 */
async function creditCommission(req, res, next) {
  try {
    const { marketerUniqueId, orderUniqueId, deviceType } = req.body;
    const commission = deviceType.toLowerCase() === 'ios' ? 15000 : 10000;
    const withdrawablePart = Math.floor(commission * 0.4);

    // 1) Update wallet balance & withdrawable
    await pool.query(`
      UPDATE wallets
      SET balance      = balance + $1,
          withdrawable = withdrawable + $2,
          updated_at   = NOW()
      WHERE user_unique_id = $3
    `, [commission, withdrawablePart, marketerUniqueId]);

    // 2) Log the transaction
    await pool.query(`
      INSERT INTO wallet_transactions (user_unique_id, amount, type, meta)
      VALUES ($1, $2, 'commission', $3::jsonb)
    `, [
      marketerUniqueId,
      commission,
      JSON.stringify({ order_unique_id: orderUniqueId, device_type: deviceType })
    ]);

    res.json({ message: 'Commission credited.' });
  } catch (err) {
    next(err);
  }
}

/**
 * Marketer requests a withdrawal (up to their withdrawable balance).
 */
async function requestWithdrawal(req, res, next) {
  try {
    const userUniqueId = req.user.unique_id;
    const { amount } = req.body;

    // 1) Check withdrawable balance
    const { rows } = await pool.query(`
      SELECT withdrawable
      FROM wallets
      WHERE user_unique_id = $1
    `, [userUniqueId]);

    if (!rows.length || rows[0].withdrawable < amount) {
      return res.status(400).json({ message: 'Insufficient withdrawable balance.' });
    }

    // 2) Deduct from withdrawable
    await pool.query(`
      UPDATE wallets
      SET withdrawable = withdrawable - $1,
          updated_at   = NOW()
      WHERE user_unique_id = $2
    `, [amount, userUniqueId]);

    // 3) Create withdrawal request
    const result = await pool.query(`
      INSERT INTO withdrawal_requests (user_unique_id, amount)
      VALUES ($1, $2)
      RETURNING *
    `, [userUniqueId, amount]);

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
    const adminId = req.user.unique_id;

    // Fetch the pending request
    const { rows } = await pool.query(`
      SELECT * FROM withdrawal_requests
      WHERE id = $1 AND status = 'pending'
    `, [reqId]);
    if (!rows.length) return res.status(404).json({ message: 'Not found or already reviewed.' });

    const reqRow = rows[0];

    if (action === 'approve') {
      // a) Debit wallet balance
      await pool.query(`
        UPDATE wallets
        SET balance    = balance - $1,
            updated_at = NOW()
        WHERE user_unique_id = $2
      `, [reqRow.amount, reqRow.user_unique_id]);

      // b) Log transaction
      await pool.query(`
        INSERT INTO wallet_transactions (user_unique_id, amount, type)
        VALUES ($1, -$2, 'withdraw_approved')
      `, [reqRow.user_unique_id, reqRow.amount]);

      // c) Mark request approved
      await pool.query(`
        UPDATE withdrawal_requests
        SET status      = 'approved',
            reviewed_at = NOW(),
            reviewed_by = $1
        WHERE id = $2
      `, [adminId, reqId]);

    } else {
      // Rejected: refund withdrawable
      await pool.query(`
        UPDATE wallets
        SET withdrawable = withdrawable + $1,
            updated_at   = NOW()
        WHERE user_unique_id = $2
      `, [reqRow.amount, reqRow.user_unique_id]);

      await pool.query(`
        UPDATE withdrawal_requests
        SET status      = 'rejected',
            reviewed_at = NOW(),
            reviewed_by = $1
        WHERE id = $2
      `, [adminId, reqId]);
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

    // fetch wallet
    const { rows: walletRows } = await pool.query(`
      SELECT *
      FROM wallets
      WHERE user_unique_id = $1
    `, [userUniqueId]);
    const wallet = walletRows[0] || null;

    // fetch recent txns
    const { rows: txs } = await pool.query(`
      SELECT *
      FROM wallet_transactions
      WHERE user_unique_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [userUniqueId]);

    res.json({ wallet, transactions: txs });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  creditCommission,
  requestWithdrawal,
  listWithdrawalRequests,
  reviewWithdrawalRequest,
  getMyWallet,
};
