const { pool } = require('../config/database');

const COMMISSION_RATES = { android:10000, iphone:15000 };

/**
 * 1) Credit commission when an order is confirmed:
 *    - commission = rate * qty
 *    - available = floor(commission * 0.4)
 *    - withheld  = commission - available
 *    - updates wallet balances + writes 3 txns
 */
async function creditCommissionFromOrder(marketerId, orderId, deviceType, qty) {
  const rate      = COMMISSION_RATES[deviceType.toLowerCase()];
  const commission= rate * qty;
  const available = Math.floor(commission * 0.4);
  const withheld  = commission - available;

  // 1) ensure wallet row
  await pool.query(`
    INSERT INTO wallets(user_unique_id) VALUES($1)
    ON CONFLICT DO NOTHING
  `, [marketerId]);

  // 2) update wallet
  await pool.query(`
    UPDATE wallets
       SET total_balance     = total_balance     + $1,
           available_balance = available_balance + $2,
           withheld_balance  = withheld_balance  + $3,
           updated_at = NOW()
     WHERE user_unique_id = $4
  `, [commission, available, withheld, marketerId]);

  // 3) log txns
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES
      ($1, $2, 'commission',           $5),
      ($1, $3, 'commission_available', '{}'),
      ($1, $4, 'commission_withheld',  '{}')
  `, [marketerId, commission, available, withheld, JSON.stringify({ orderId })]);

  return { commission, available, withheld };
}

/**
 * 2) Fetch a marketer’s wallet + last 20 txns
 */
async function getMyWallet(marketerId) {
  // ensure row
  await pool.query(`
    INSERT INTO wallets(user_unique_id) VALUES($1) ON CONFLICT DO NOTHING
  `, [marketerId]);

  const { rows:[wallet] } = await pool.query(`
    SELECT total_balance, available_balance, withheld_balance
      FROM wallets WHERE user_unique_id=$1
  `, [marketerId]);

  const { rows: transactions } = await pool.query(`
    SELECT id, transaction_type, amount, created_at
      FROM wallet_transactions
     WHERE user_unique_id = $1
     ORDER BY created_at DESC
     LIMIT 20
  `, [marketerId]);

  return { wallet, transactions };
}

/**
 * 3) Request a withdrawal
 */
async function requestWithdrawal(marketerId, amount, bankDetails) {
  const FEE = 100;
  // fetch balances
  const { rows:[w] } = await pool.query(`
    SELECT available_balance FROM wallets WHERE user_unique_id=$1
  `, [marketerId]);
  if (!w || w.available_balance < amount + FEE) {
    throw new Error("Insufficient available balance including fee");
  }
  const net = amount + FEE;

  // 1) deduct from available into withheld
  await pool.query(`
    UPDATE wallets
       SET available_balance = available_balance - $1,
           withheld_balance  = withheld_balance  + $1,
           updated_at        = NOW()
     WHERE user_unique_id = $2
  `, [net, marketerId]);

  // 2) create withdrawal request
  const { rows:[req] } = await pool.query(`
    INSERT INTO withdrawal_requests
      (user_unique_id, amount_requested, fee, net_amount, status, account_name, account_number, bank_name)
    VALUES ($1,$2,$3,$4,'pending',$5,$6,$7)
    RETURNING *
  `, [
    marketerId,
    amount,
    FEE,
    net,
    bankDetails.account_name,
    bankDetails.account_number,
    bankDetails.bank_name
  ]);

  // 3) log a transaction for the “withdraw_request”
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES ($1, -$2, 'withdraw_request', $3)
  `, [marketerId, net, JSON.stringify({ reqId: req.id })]);

  return req;
}

/**
 * 4) List a marketer’s own withdrawal requests
 */
async function getMyWithdrawals(marketerId) {
  const { rows } = await pool.query(`
    SELECT id, amount_requested AS amount, fee, net_amount AS total, status, requested_at
      FROM withdrawal_requests
     WHERE user_unique_id = $1
     ORDER BY requested_at DESC
  `, [marketerId]);
  return rows;
}

/**
 * 5) Admin: list all pending withdrawal_requests
 */
async function listPendingRequests() {
  const { rows } = await pool.query(`
    SELECT w.id, w.user_unique_id, u.first_name AS marketer_name,
           w.amount_requested AS amount, w.fee, w.net_amount AS total,
           w.account_name, w.account_number, w.bank_name,
           w.requested_at
      FROM withdrawal_requests w
      JOIN users u ON u.unique_id = w.user_unique_id
     WHERE w.status = 'pending'
     ORDER BY w.requested_at DESC
  `);
  return rows;
}

/**
 * 6) Admin: review (approve|reject)
 */
async function reviewRequest(reqId, action, adminId) {
  const { rows:[r] } = await pool.query(`
    SELECT * FROM withdrawal_requests WHERE id=$1 AND status='pending'
  `, [reqId]);
  if (!r) throw new Error("Request not found or already processed");

  if (action === 'approve') {
    // mark approved
    await pool.query(`
      UPDATE withdrawal_requests
         SET status='approved', reviewed_by=$2, reviewed_at=NOW()
       WHERE id=$1
    `, [reqId, adminId]);
    // log a txn
    await pool.query(`
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type, meta)
      VALUES ($1, -$2, 'withdraw_approved', $3)
    `, [r.user_unique_id, r.net_amount, JSON.stringify({ reqId })]);

  } else { // reject
    // refund (move from withheld back to available)
    await pool.query(`
      UPDATE wallets
         SET available_balance = available_balance + $1,
             withheld_balance  = withheld_balance - $1,
             updated_at        = NOW()
       WHERE user_unique_id = $2
    `, [r.net_amount, r.user_unique_id]);

    await pool.query(`
      UPDATE withdrawal_requests
         SET status='rejected', reviewed_by=$2, reviewed_at=NOW()
       WHERE id=$1
    `, [reqId, adminId]);

    await pool.query(`
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type, meta)
      VALUES ($1, $2, 'withdraw_rejected', $3)
    `, [r.user_unique_id, r.net_amount, JSON.stringify({ reqId })]);
  }
}

/**
 * 7) Release withheld at month-end
 */
async function releaseWithheld() {
  const { rows } = await pool.query(`
    SELECT user_unique_id, withheld_balance
      FROM wallets
     WHERE withheld_balance > 0
  `);
  for (let w of rows) {
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
      VALUES ($1, $2, 'release_withheld', $3)
    `, [
      w.user_unique_id,
      w.withheld_balance,
      JSON.stringify({ period: new Date().toISOString().slice(0,7) })
    ]);
  }
}

module.exports = {
  creditCommissionFromOrder,
  getMyWallet,
  requestWithdrawal,
  getMyWithdrawals,
  listPendingRequests,
  reviewRequest,
  releaseWithheld
};
