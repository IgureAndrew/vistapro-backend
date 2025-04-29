// src/services/walletService.js
const { pool } = require('../config/database');

const COMMISSION_RATES = {
  android: 10000,
  iphone:  15000,
};

/**
 * 1) Credit a lump-sum commission into a marketer's wallet
 *    – Splits into 40% available, 60% withheld
 *    – Updates balances and writes three wallet_transactions
 */
async function creditCommissionFromAmount(userId, orderId, commission) {
  // ensure wallet row exists
  await pool.query(`
    INSERT INTO wallets
      (user_unique_id, total_balance, available_balance, withheld_balance, created_at, updated_at)
    VALUES ($1, 0, 0, 0, NOW(), NOW())
    ON CONFLICT (user_unique_id) DO NOTHING
  `, [userId]);

  const available = Math.floor(commission * 0.4);
  const withheld  = commission - available;

  // update wallet balances
  await pool.query(`
    UPDATE wallets
       SET total_balance     = total_balance     + $1,
           available_balance = available_balance + $2,
           withheld_balance  = withheld_balance  + $3,
           updated_at        = NOW()
     WHERE user_unique_id = $4
  `, [commission, available, withheld, userId]);

  // log three transactions
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES
      ($1, $2, 'commission',            $5::jsonb),
      ($1, $3, 'commission_available',  '{}'::jsonb),
      ($1, $4, 'commission_withheld',   '{}'::jsonb)
  `, [
    userId,
    commission,
    available,
    withheld,
    JSON.stringify({ orderId }),
  ]);

  return { commission, available, withheld };
}

/**
 * 2) Fetch marketer’s wallet summary + last 20 transactions
 */
async function getMyWallet(userId) {
  // ensure wallet row
  await pool.query(`
    INSERT INTO wallets(user_unique_id)
      VALUES ($1)
    ON CONFLICT (user_unique_id) DO NOTHING
  `, [userId]);

  // get balances
  const { rows: [wallet] } = await pool.query(`
    SELECT total_balance, available_balance, withheld_balance
      FROM wallets
     WHERE user_unique_id = $1
  `, [userId]);

  // get last 20 txns
  const { rows: transactions } = await pool.query(`
    SELECT id, transaction_type, amount, created_at
      FROM wallet_transactions
     WHERE user_unique_id = $1
     ORDER BY created_at DESC
     LIMIT 20
  `, [userId]);

  return { wallet, transactions };
}

/**
 * 3) Marketer requests a withdrawal (fee +100 automatically added)
 */
async function requestWithdrawal(userId, amount, bankDetails) {
  const FEE = 100;
  // check available balance
  const { rows: [w] } = await pool.query(`
    SELECT available_balance
      FROM wallets
     WHERE user_unique_id = $1
  `, [userId]);

  if (!w || w.available_balance < amount + FEE) {
    throw new Error("Insufficient available balance (including ₦100 fee)");
  }

  const net = amount + FEE;

  // move net from available→withheld
  await pool.query(`
    UPDATE wallets
       SET available_balance = available_balance - $1,
           withheld_balance  = withheld_balance  + $1,
           updated_at        = NOW()
     WHERE user_unique_id = $2
  `, [net, userId]);

  // create withdrawal request
  const { rows: [req] } = await pool.query(`
    INSERT INTO withdrawal_requests
      (user_unique_id, amount_requested, fee, net_amount,
       status, account_name, account_number, bank_name, requested_at)
    VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, NOW())
    RETURNING *
  `, [
    userId,
    amount,
    FEE,
    net,
    bankDetails.account_name,
    bankDetails.account_number,
    bankDetails.bank_name,
  ]);

  // log withdraw_request txn
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES ($1, -$2, 'withdraw_request', $3::jsonb)
  `, [userId, net, JSON.stringify({ reqId: req.id })]);

  return req;
}

/**
 * 4) Marketer: list their own withdrawal requests
 */
async function getMyWithdrawals(userId) {
  const { rows } = await pool.query(`
    SELECT
      id,
      amount_requested AS amount,
      fee,
      net_amount       AS total,
      status,
      requested_at
    FROM withdrawal_requests
    WHERE user_unique_id = $1
    ORDER BY requested_at DESC
  `, [userId]);

  return rows;
}

/**
 * 5) Admin: list all pending withdrawal requests
 */
async function listPendingRequests() {
  const { rows } = await pool.query(`
    SELECT
      w.id,
      w.user_unique_id,
      u.first_name    AS marketer_name,
      w.amount_requested AS amount,
      w.fee,
      w.net_amount   AS total,
      w.account_name,
      w.account_number,
      w.bank_name,
      w.requested_at
    FROM withdrawal_requests w
    JOIN users u ON u.unique_id = w.user_unique_id
    WHERE w.status = 'pending'
    ORDER BY w.requested_at DESC
  `);

  return rows;
}

/**
 * 6) Admin: approve or reject a withdrawal request
 */
async function reviewRequest(reqId, action, adminId) {
  // … your existing review logic …
}

/**
 * 7) MasterAdmin: release a single marketer’s withheld → available
 */
async function releaseWithheld(userId) {
  // fetch this user’s withheld balance
  const { rows } = await pool.query(`
    SELECT withheld_balance
      FROM wallets
     WHERE user_unique_id = $1
  `, [userId]);

  if (!rows.length) {
    throw new Error("Wallet not found for user " + userId);
  }

  const withheld = rows[0].withheld_balance;
  if (withheld <= 0) {
    return { released: 0 };
  }

  // update balances
  await pool.query(`
    UPDATE wallets
       SET available_balance = available_balance + $1,
           withheld_balance  = 0,
           updated_at        = NOW()
     WHERE user_unique_id = $2
  `, [withheld, userId]);

  // log release_withheld txn
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES ($1, $2, 'release_withheld', $3::jsonb)
  `, [
    userId,
    withheld,
    JSON.stringify({ at: new Date().toISOString() })
  ]);

  return { released: withheld };
}

/**
 * 8) MasterAdmin: fetch all wallets
 */
async function getAllWallets() {
  const { rows } = await pool.query(`
    SELECT
      w.user_unique_id,
      u.first_name    AS marketer_name,
      w.total_balance,
      w.available_balance,
      w.withheld_balance
    FROM wallets w
    JOIN users u
      ON u.unique_id = w.user_unique_id
    ORDER BY u.first_name
  `);
  return rows;
}

/**
 * 8) Revert the most recent release_withheld for one marketer:
 *    ➔ subtracts the released amount from available_balance,
 *      adds it back into withheld_balance,
 *    ➔ logs a `release_reverted` transaction.
 */
async function revertLastRelease(userId) {
  // 1) Find the most recent release_withheld transaction
  const { rows } = await pool.query(`
    SELECT amount
      FROM wallet_transactions
     WHERE user_unique_id = $1
       AND transaction_type = 'release_withheld'
     ORDER BY created_at DESC
     LIMIT 1
  `, [ userId ]);

  if (!rows.length) {
    throw new Error("No release_withheld found to revert.");
  }
  const releasedAmount = Number(rows[0].amount);

  // 2) Move it back: available_balance -= released, withheld_balance += released
  await pool.query(`
    UPDATE wallets
       SET available_balance = available_balance - $1,
           withheld_balance  = withheld_balance  + $1,
           updated_at        = NOW()
     WHERE user_unique_id = $2
  `, [ releasedAmount, userId ]);

  // 3) Log the reversal
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES ($1, -$2, 'release_reverted', '{}'::jsonb)
  `, [ userId, releasedAmount ]);

  return releasedAmount;
}

module.exports = {
  COMMISSION_RATES,
  creditCommissionFromAmount,
  getMyWallet,
  requestWithdrawal,
  getMyWithdrawals,
  listPendingRequests,
  reviewRequest,
  releaseWithheld,   // now per‐user
  getAllWallets,
  revertLastRelease,
};
