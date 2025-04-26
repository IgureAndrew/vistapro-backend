// src/services/walletService.js
const { pool } = require('../config/database');

// Commission lookup per device type
const COMMISSION_RATES = {
  android: 10000,
  iphone:  15000,
};

/**
 * Helper: turn unique_id → numeric user ID
 */
async function _getUserId(uniqueId) {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE unique_id = $1`,
    [uniqueId]
  );
  if (!rows.length) throw new Error("User not found");
  return rows[0].id;
}

/**
 * Split a total commission amount into 40% available / 60% withheld,
 * bump the wallet balances, and write 3 transactions.
 */
async function creditCommissionFromAmount(marketerUniqueId, orderId, commission) {
  const marketerId = await _getUserId(marketerUniqueId);

  const available = Math.floor(commission * 0.4);
  const withheld  = commission - available;

  // 1) update wallet row
  await pool.query(
    `UPDATE wallets
        SET total_balance     = total_balance     + $1,
            available_balance = available_balance + $2,
            withheld_balance  = withheld_balance  + $3,
            updated_at        = NOW()
      WHERE marketer_id = $4`,
    [commission, available, withheld, marketerId]
  );

  // 2) write wallet_transactions
  await pool.query(
    `INSERT INTO wallet_transactions (
        marketer_id, amount, transaction_type, meta, created_at
      ) VALUES
        ($1, $2, 'commission',           $5, NOW()),
        ($1, $3, 'commission_available', '{}', NOW()),
        ($1, $4, 'commission_withheld',  '{}', NOW())`,
    [marketerId, commission, available, withheld, JSON.stringify({ orderId })]
  );

  return { commission, available, withheld };
}

/**
 * Convenience if you only know deviceType + qty:
 */
async function creditCommission(
  marketerUniqueId,
  orderId,
  deviceType
) {
  const key = deviceType.toLowerCase();
  const perDevice = COMMISSION_RATES[key];
  if (!perDevice) throw new Error(`Unknown deviceType "${deviceType}"`);
  const commission = perDevice * /* qty comes from controller */ 1;
  return creditCommissionFromAmount(marketerUniqueId, orderId, commission);
}

/**
 * Ensure wallet row exists, then select balances + last 20 txs.
 */
async function getMyWallet(marketerUniqueId) {
  const marketerId = await _getUserId(marketerUniqueId);

  // upsert
  await pool.query(
    `INSERT INTO wallets
       (marketer_id, total_balance, available_balance, withheld_balance, created_at, updated_at)
     VALUES ($1, 0, 0, 0, NOW(), NOW())
     ON CONFLICT (marketer_id) DO NOTHING`,
    [marketerId]
  );

  // fetch balances
  const { rows: wrows } = await pool.query(
    `SELECT total_balance, available_balance, withheld_balance
       FROM wallets
      WHERE marketer_id = $1`,
    [marketerId]
  );
  const wallet = wrows[0];

  // fetch recent transactions
  const { rows: txs } = await pool.query(
    `SELECT id, transaction_type, amount, created_at
       FROM wallet_transactions
      WHERE marketer_id = $1
      ORDER BY created_at DESC
      LIMIT 20`,
    [marketerId]
  );

  return { wallet, transactions: txs };
}

/**
 * Upsert bank details table (keyed by marketer_id)
 */
async function upsertBankDetails(marketerUniqueId, { account_name, account_number, bank_name }) {
  const marketerId = await _getUserId(marketerUniqueId);

  await pool.query(
    `INSERT INTO marketer_bank_details
       (marketer_id, account_name, account_number, bank_name, created_at, updated_at)
     VALUES ($1,$2,$3,$4,NOW(),NOW())
     ON CONFLICT (marketer_id)
     DO UPDATE SET
       account_name   = EXCLUDED.account_name,
       account_number = EXCLUDED.account_number,
       bank_name      = EXCLUDED.bank_name,
       updated_at     = NOW()`,
    [marketerId, account_name, account_number, bank_name]
  );
}

/**
 * Get a marketer’s bank details
 */
async function getBankDetails(marketerUniqueId) {
  const marketerId = await _getUserId(marketerUniqueId);

  const { rows } = await pool.query(
    `SELECT account_name, account_number, bank_name
       FROM marketer_bank_details
      WHERE marketer_id = $1`,
    [marketerId]
  );
  return rows[0] || null;
}

/**
 * Request a withdrawal: deduct (amount+fee) from available,
 * bump it into withheld, insert a withdrawal_requests row.
 */
async function requestWithdrawal(marketerUniqueId, amount) {
  const marketerId = await _getUserId(marketerUniqueId);
  const FEE = 100;

  // get current balances
  const { rows: wrows } = await pool.query(
    `SELECT available_balance
       FROM wallets
      WHERE marketer_id = $1`,
    [marketerId]
  );
  if (!wrows.length) throw new Error("Wallet not found");
  const available = Number(wrows[0].available_balance);

  if (available < amount + FEE) {
    throw new Error("Insufficient balance for withdrawal + ₦100 fee");
  }

  // deduct + withhold
  await pool.query(
    `UPDATE wallets
        SET available_balance = available_balance - $1,
            withheld_balance  = withheld_balance + $1,
            updated_at        = NOW()
      WHERE marketer_id = $2`,
    [amount + FEE, marketerId]
  );

  // insert request
  const { rows: reqRows } = await pool.query(
    `INSERT INTO withdrawal_requests
       (marketer_id, amount, fee, status, created_at)
     VALUES ($1, $2, $3, 'pending', NOW())
     RETURNING *`,
    [marketerId, amount, FEE]
  );

  return reqRows[0];
}

/**
 * MasterAdmin: list all pending withdrawal requests
 */
async function listWithdrawalRequests() {
  const { rows } = await pool.query(
    `SELECT wr.*, u.unique_id AS marketer_unique_id, u.first_name AS marketer_name,
            b.bank_name, b.account_name, b.account_number
       FROM withdrawal_requests wr
       JOIN users u ON u.id = wr.marketer_id
  LEFT JOIN marketer_bank_details b ON b.marketer_id = wr.marketer_id
      WHERE wr.status = 'pending'
      ORDER BY wr.created_at DESC`
  );
  return rows;
}

/**
 * MasterAdmin: approve or reject a withdrawal
 */
async function reviewWithdrawalRequest(reqId, action, adminUniqueId) {
  const adminId = await _getUserId(adminUniqueId);

  // fetch the request
  const { rows } = await pool.query(
    `SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'pending'`,
    [reqId]
  );
  if (!rows.length) throw new Error("Request not found or already reviewed");
  const req = rows[0];

  if (action === 'approve') {
    // mark approved
    await pool.query(
      `UPDATE withdrawal_requests
         SET status      = 'approved',
             reviewed_by = $2,
             reviewed_at = NOW()
       WHERE id = $1`,
      [reqId, adminId]
    );
    // log in wallet_transactions
    await pool.query(
      `INSERT INTO wallet_transactions
        (marketer_id, amount, transaction_type, meta, created_at)
       VALUES ($1, $2, 'withdrawal_approved', $3, NOW())`,
      [req.marketer_id, req.amount, JSON.stringify({ requestId: reqId })]
    );

  } else {
    // refund available + fee back into available_balance
    await pool.query(
      `UPDATE wallets
         SET available_balance = available_balance + ($1 + $2),
             withheld_balance  = withheld_balance - ($1 + $2),
             updated_at        = NOW()
       WHERE marketer_id = $3`,
      [req.amount, req.fee, req.marketer_id]
    );
    // mark rejected
    await pool.query(
      `UPDATE withdrawal_requests
         SET status      = 'rejected',
             reviewed_by = $2,
             reviewed_at = NOW()
       WHERE id = $1`,
      [reqId, adminId]
    );
    // log in wallet_transactions
    await pool.query(
      `INSERT INTO wallet_transactions
        (marketer_id, amount, transaction_type, meta, created_at)
       VALUES ($1, $2, 'withdrawal_rejected', $3, NOW())`,
      [req.marketer_id, req.amount + req.fee, JSON.stringify({ requestId: reqId })]
    );
  }
}

/**
 * Monthly cron: release all withheld balances
 */
async function releaseWithheld() {
  const { rows } = await pool.query(
    `SELECT marketer_id, withheld_balance
       FROM wallets
      WHERE withheld_balance > 0`
  );

  for (const w of rows) {
    await pool.query(
      `UPDATE wallets
         SET available_balance = available_balance + $1,
             withheld_balance  = 0,
             updated_at        = NOW()
       WHERE marketer_id = $2`,
      [w.withheld_balance, w.marketer_id]
    );
    await pool.query(
      `INSERT INTO wallet_transactions
        (marketer_id, amount, transaction_type, meta, created_at)
       VALUES ($1, $2, 'release_withheld', $3, NOW())`,
      [w.marketer_id, w.withheld_balance, JSON.stringify({ period: new Date().toISOString().slice(0,7) })]
    );
  }
}

/**
 * Get daily stats for commissions & withdrawals
 */
async function getStats(marketerUniqueId, from, to) {
  const marketerId = await _getUserId(marketerUniqueId);

  const { rows } = await pool.query(
    `SELECT
       DATE(created_at) AS day,
       SUM(amount) FILTER(WHERE transaction_type='commission')       AS commission,
       SUM(amount) FILTER(WHERE transaction_type='withdrawal_approved') AS withdrawals
     FROM wallet_transactions
     WHERE marketer_id = $1
       AND created_at BETWEEN $2 AND $3
     GROUP BY day
     ORDER BY day`,
    [marketerId, from, to]
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
