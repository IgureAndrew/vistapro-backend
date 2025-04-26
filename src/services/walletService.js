// src/services/walletService.js
const { pool } = require('../config/database');

// Commission lookup by device type (case-insensitive)
const COMMISSION_RATES = {
  android: 10000,
  iphone:  15000,
};

/**
 * Credit commission based on deviceType (backwards compatibility).
 * Delegates to creditCommissionFromAmount.
 */
async function creditCommission(userId, orderId, deviceType) {
  const key = deviceType.toLowerCase();
  const commission = COMMISSION_RATES[key];
  if (!commission) {
    throw new Error(`Unknown deviceType "${deviceType}"`);
  }
  return creditCommissionFromAmount(userId, orderId, commission);
}

/**
 * Split a fixed commission amount into available/withheld,
 * update the wallet, and log transactions.
 * @param {string} userId - marketer unique_id
 * @param {number} orderId
 * @param {number} commission - total commission amount in Naira
 * @returns {Object} { commission, available, withheld }
 */
async function creditCommissionFromAmount(userId, orderId, commission) {
  const available = Math.floor(commission * 0.4);
  const withheld  = commission - available;

  // 1) Update wallet balances
  await pool.query(
    `UPDATE wallets
       SET total_balance     = total_balance     + $1,
           available_balance = available_balance + $2,
           withheld_balance  = withheld_balance  + $3,
           updated_at        = NOW()
     WHERE user_unique_id = $4`,
    [commission, available, withheld, userId]
  );

  // 2) Log transactions
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_unique_id, amount, transaction_type, meta)
     VALUES
       ($1, $2, 'commission',            $5),
       ($1, $3, 'commission_available',  '{}'),
       ($1, $4, 'commission_withheld',   '{}')`,
    [userId, commission, available, withheld, JSON.stringify({ orderId })]
  );

  return { commission, available, withheld };
}

/**
 * Retrieve wallet summary and recent transactions
 */
async function getMyWallet(userId) {
  const { rows: ws } = await pool.query(
    `SELECT total_balance, available_balance, withheld_balance
       FROM wallets
      WHERE user_unique_id = $1`,
    [userId]
  );
  if (!ws.length) throw new Error('Wallet not found');
  const wallet = ws[0];

  const { rows: txs } = await pool.query(
    `SELECT id, amount, transaction_type, meta, created_at
       FROM wallet_transactions
      WHERE user_unique_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [userId]
  );

  return { wallet, transactions: txs };
}

/**
 * Upsert marketer bank details
 */
async function upsertBankDetails(userId, { account_name, account_number, bank_name }) {
  // ensure wallet exists
  await pool.query(
    `INSERT INTO wallets (user_unique_id)
      VALUES ($1)
      ON CONFLICT (user_unique_id) DO NOTHING`,
    [userId]
  );
  // insert or update bank record
  await pool.query(
    `INSERT INTO marketer_bank_details
       (user_unique_id, account_name, account_number, bank_name)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_unique_id)
     DO UPDATE SET
       account_name   = $2,
       account_number = $3,
       bank_name      = $4,
       updated_at     = NOW()`,
    [userId, account_name, account_number, bank_name]
  );
}

/**
 * Retrieve marketer bank details
 */
async function getBankDetails(userId) {
  const { rows } = await pool.query(
    `SELECT account_name, account_number, bank_name
       FROM marketer_bank_details
      WHERE user_unique_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Marketer withdrawal request
 */
// services/walletService.js
async function requestWithdrawal(marketerUniqueId, amount) {
  const FEE = 100;
  // 1) fetch balances
  const wallet = await getWalletRow(marketerUniqueId);
  if (wallet.available < amount + FEE) {
    throw new Error("Insufficient balance for withdrawal + ₦100 fee");
  }

  // 2) deduct (amount + fee) from available
  await pool.query(`
    UPDATE wallets
       SET available = available - $1,
           withheld  = withheld + $1
     WHERE unique_id = $2
  `, [amount + FEE, marketerUniqueId]);

  // 3) insert into withdrawal_requests
  const { rows } = await pool.query(`
    INSERT INTO withdrawal_requests
      (marketer_unique_id, amount_requested, fee, status, created_at)
    VALUES ($1, $2, $3, 'pending', NOW())
    RETURNING *
  `, [marketerUniqueId, amount, FEE]);

  return rows[0];
}

/**
 * List all pending withdrawal requests
 */
async function listWithdrawalRequests() {
  const { rows } = await pool.query(
    `SELECT * FROM withdrawal_requests WHERE status = 'pending' ORDER BY requested_at DESC`
  );
  return rows;
}

/**
 * Master admin review of withdrawal
 */
async function reviewWithdrawalRequest(reqId, action, adminId) {
  const { rows } = await pool.query(
    `SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'pending'`,
    [reqId]
  );
  if (!rows.length) throw new Error('Not found or already reviewed.');
  const req = rows[0];

  if (action === 'approve') {
    // mark approved and log
    await pool.query(
      `UPDATE withdrawal_requests SET status='approved', reviewed_by=$2, reviewed_at=NOW() WHERE id=$1`,
      [reqId, adminId]
    );
    await pool.query(
      `INSERT INTO wallet_transactions (user_unique_id, amount, transaction_type)
       VALUES ($1, $2, 'withdraw_approved')`,
      [req.user_unique_id, req.net_amount]
    );
  } else {
    // refund
    await pool.query(
      `UPDATE wallets SET available_balance=available_balance + ($2 + fee), updated_at=NOW() WHERE user_unique_id=$1`,
      [req.user_unique_id, req.amount]
    );
    await pool.query(
      `UPDATE withdrawal_requests SET status='rejected', reviewed_by=$2, reviewed_at=NOW() WHERE id=$1`,
      [reqId, adminId]
    );
    await pool.query(
      `INSERT INTO wallet_transactions (user_unique_id, amount, transaction_type)
       VALUES ($1, $2, 'withdraw_rejected')`,
      [req.user_unique_id, req.amount + req.fee]
    );
  }
}

/**
 * Monthly release of withheld balances
 */
async function releaseWithheld() {
  const { rows } = await pool.query(
    `SELECT user_unique_id, withheld_balance FROM wallets WHERE withheld_balance > 0`
  );
  for (const w of rows) {
    await pool.query(
      `UPDATE wallets
         SET available_balance = available_balance + $1,
             withheld_balance  = 0,
             updated_at        = NOW()
       WHERE user_unique_id = $2`,
      [w.withheld_balance, w.user_unique_id]
    );
    await pool.query(
      `INSERT INTO wallet_transactions (user_unique_id, amount, transaction_type, meta)
       VALUES ($1, $2, 'release_withheld', $3)`,
      [w.user_unique_id, w.withheld_balance, JSON.stringify({ period: new Date().toISOString().slice(0,7) })]
    );
  }
}

/**
 * Get commission/withdrawal stats between dates
 */
async function getStats(userId, from, to) {
  const { rows } = await pool.query(
    `SELECT DATE(created_at) AS day,
            SUM(amount) FILTER (WHERE transaction_type='commission')            AS commission,
            SUM(amount) FILTER (WHERE transaction_type='withdraw_approved')      AS withdrawals
       FROM wallet_transactions
      WHERE user_unique_id = $1
        AND created_at BETWEEN $2 AND $3
      GROUP BY day
      ORDER BY day`,
    [userId, from, to]
  );
  return rows;
}

module.exports = {
  creditCommission,
  creditCommissionFromAmount,
  getMyWallet,
  upsertBankDetails,
  getBankDetails,
  requestWithdrawal,
  listWithdrawalRequests,
  reviewWithdrawalRequest,
  releaseWithheld,
  getStats,
};
