// src/services/walletService.js
const { pool } = require('../config/database');

const COMMISSION_RATES = {
  android: 10000,
  iphone:  15000,
};

/**
 * 1) Credit a lump-sum commission into a marketer's wallet
 *    ➔ Splits into 40% available, 60% withheld
 *    ➔ Updates balances and writes three wallet_transactions
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
  const { rows: [r] } = await pool.query(`
    SELECT * FROM withdrawal_requests
     WHERE id = $1 AND status = 'pending'
  `, [reqId]);
  if (!r) throw new Error("Request not found or already processed");

  if (action === 'approve') {
    // mark approved
    await pool.query(`
      UPDATE withdrawal_requests
         SET status = 'approved',
             reviewed_by = $2,
             reviewed_at = NOW()
       WHERE id = $1
    `, [reqId, adminId]);
    // log transaction
    await pool.query(`
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type, meta)
      VALUES ($1, -$2, 'withdraw_approved', $3::jsonb)
    `, [r.user_unique_id, r.net_amount, JSON.stringify({ reqId })]);

  } else {
    // refund net back to available, remove from withheld
    await pool.query(`
      UPDATE wallets
         SET available_balance = available_balance + $1,
             withheld_balance  = withheld_balance - $1,
             updated_at        = NOW()
       WHERE user_unique_id = $2
    `, [r.net_amount, r.user_unique_id]);

    await pool.query(`
      UPDATE withdrawal_requests
         SET status = 'rejected',
             reviewed_by = $2,
             reviewed_at = NOW()
       WHERE id = $1
    `, [reqId, adminId]);

    await pool.query(`
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type, meta)
      VALUES ($1, $2, 'withdraw_rejected', $3::jsonb)
    `, [r.user_unique_id, r.net_amount, JSON.stringify({ reqId })]);
  }
}

/**
 * 7) At month-end: release all withheld balances
 */
async function releaseWithheld() {
  const { rows } = await pool.query(`
    SELECT user_unique_id, withheld_balance
      FROM wallets
     WHERE withheld_balance > 0
  `);

  for (const w of rows) {
    await pool.query(`
      UPDATE wallets
         SET available_balance = available_balance + $1,
             withheld_balance  = 0,
             updated_at        = NOW()
       WHERE user_unique_id = $2
    `, [w.withheld_balance, w.user_unique_id]);

    await pool.query(`
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type, meta)
      VALUES ($1, $2, 'release_withheld', $3::jsonb)
    `, [
      w.user_unique_id,
      w.withheld_balance,
      JSON.stringify({ period: new Date().toISOString().slice(0,7) })
    ]);
  }
}

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
module.exports = {
  creditCommissionFromAmount,
  getMyWallet,
  requestWithdrawal,
  getMyWithdrawals,
  listPendingRequests,
  reviewRequest,
  releaseWithheld,
  getAllWallets, 
};
