// src/services/walletService.js
const { pool } = require('../config/database');
/**
 * Split a fixed commission amount into available/withheld,
 * update the wallet, and log three transactions.
 *
 * @param {string} userId       the marketer’s unique_id
 * @param {number} orderId      the order’s PK
 * @param {number} commission   total commission in Naira
 */
async function creditCommissionFromAmount(userId, orderId, commission) {
    // 40% withdrawable, 60% withheld
    const available = Math.floor(commission * 0.4);
    const withheld  = commission - available;
  
    // 1) Update wallet balances
    await pool.query(
      `UPDATE wallets
          SET total_balance     = total_balance     + $1,
              available_balance = available_balance + $2,
              withheld_balance  = withheld_balance  + $3,
              updated_at        = NOW()
        WHERE user_unique_id = $4
      `,
      [commission, available, withheld, userId]
    );
  
    // 2) Log transactions
    await pool.query(
      `INSERT INTO wallet_transactions
         (user_unique_id, amount, transaction_type, meta)
       VALUES
         ($1, $2, 'commission',            $5),
         ($1, $3, 'commission_available', '{}'),
         ($1, $4, 'commission_withheld',  '{}')
      `,
      [
        userId,
        commission,
        available,
        withheld,
        JSON.stringify({ orderId, reason: 'order_commission' })
      ]
    );
  
    return { available, withheld };
  }
  
const COMMISSION_RATES = {
  android: 10000,
  iphone:  15000,
};

async function creditCommission(userId, orderId, deviceType) {
  const commission = COMMISSION_RATES[deviceType] || 0;
  const available  = Math.floor(commission * 0.4);
  const withheld   = commission - available;

  await pool.query(`
    UPDATE wallets
       SET total_balance     = total_balance + $1,
           available_balance = available_balance + $2,
           withheld_balance  = withheld_balance  + $3,
           updated_at        = NOW()
     WHERE user_unique_id = $4
  `, [commission, available, withheld, userId]);

  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES
      ($1, $2, 'commission',             $3),
      ($1, $4, 'commission_available',   '{}'),
      ($1, $5, 'commission_withheld',    '{}')
  `, [userId, commission, JSON.stringify({ orderId, deviceType }),
      available, withheld]);

  return { commission, available, withheld };
}

async function getMyWallet(userId) {
  const { rows: ws } = await pool.query(`
    SELECT total_balance, available_balance, withheld_balance
      FROM wallets
     WHERE user_unique_id = $1
  `, [userId]);
  if (!ws.length) throw new Error('Wallet not found');
  const wallet = ws[0];

  const { rows: txs } = await pool.query(`
    SELECT id, amount, transaction_type, created_at, meta
      FROM wallet_transactions
     WHERE user_unique_id = $1
     ORDER BY created_at DESC
     LIMIT 50
  `, [userId]);

  return { wallet, transactions: txs };
}

async function upsertBankDetails(userId, { account_name, account_number, bank_name }) {
  await pool.query(`
    INSERT INTO marketer_bank_details
      (user_unique_id, account_name, account_number, bank_name)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (user_unique_id)
    DO UPDATE SET
      account_name   = $2,
      account_number = $3,
      bank_name      = $4,
      updated_at     = NOW()
  `, [userId, account_name, account_number, bank_name]);
}

async function getBankDetails(userId) {
  const { rows } = await pool.query(`
    SELECT account_name, account_number, bank_name
      FROM marketer_bank_details
     WHERE user_unique_id = $1
  `, [userId]);
  return rows[0] || null;
}

async function requestWithdrawal(userId, amount) {
  // fetch wallet
  const { rows: ws } = await pool.query(`
    SELECT available_balance FROM wallets WHERE user_unique_id = $1
  `, [userId]);
  const avail = ws[0]?.available_balance || 0;
  const fee   = 100;
  if (amount + fee > avail) throw new Error('Insufficient available balance');

  // fetch bank details
  const bank = await getBankDetails(userId);
  if (!bank) throw new Error('Bank details not set');

  // deduct
  await pool.query(`
    UPDATE wallets
       SET available_balance = available_balance - $1,
           updated_at        = NOW()
     WHERE user_unique_id = $2
  `, [amount + fee, userId]);

  // create request
  const net = amount - fee;
  await pool.query(`
    INSERT INTO withdrawal_requests
      (user_unique_id, amount, fee, net_amount, account_name, account_number, bank_name)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [userId, amount, fee, net, bank.account_name, bank.account_number, bank.bank_name]);

  // log txns
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type)
    VALUES
      ($1, -$2, 'withdraw_request'),
      ($1, -$3, 'fee')
  `, [userId, amount, fee]);
}

async function listWithdrawalRequests() {
  const { rows } = await pool.query(`
    SELECT * FROM withdrawal_requests WHERE status = 'pending'
    ORDER BY requested_at DESC
  `);
  return rows;
}

async function reviewWithdrawalRequest(reqId, action, adminId) {
  const { rows } = await pool.query(`
    SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'pending'
  `, [reqId]);
  if (!rows.length) throw new Error('Request not found or already reviewed');
  const req = rows[0];

  if (action === 'approve') {
    await pool.query(`
      UPDATE withdrawal_requests
         SET status = 'approved', reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $1
    `, [reqId, adminId]);

    await pool.query(`
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type)
      VALUES ($1, $2, 'withdraw_approved')
    `, [req.user_unique_id, req.net_amount]);

  } else {
    // refund
    await pool.query(`
      UPDATE wallets
         SET available_balance = available_balance + ($2 + fee),
             updated_at        = NOW()
       WHERE user_unique_id = $1
    `, [req.user_unique_id, req.amount]);

    await pool.query(`
      UPDATE withdrawal_requests
         SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $1
    `, [reqId, adminId]);

    await pool.query(`
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type)
      VALUES ($1, $2, 'withdraw_rejected')
    `, [req.user_unique_id, req.amount + req.fee]);
  }
}

async function releaseWithheld() {
  // release on 1st of month
  const { rows } = await pool.query(`
    SELECT user_unique_id, withheld_balance FROM wallets WHERE withheld_balance > 0
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
      VALUES
        ($1, $2, 'release_withheld', $3)
    `, [w.user_unique_id, w.withheld_balance,
        JSON.stringify({ period: new Date().toISOString().slice(0,7) })]);
  }
}

async function getStats(userId, from, to) {
  const { rows } = await pool.query(`
    SELECT
      DATE(created_at)       AS day,
      SUM(amount) FILTER (WHERE transaction_type='commission')           AS commission,
      SUM(amount) FILTER (WHERE transaction_type IN ('withdraw_approved')) AS withdrawals
    FROM wallet_transactions
    WHERE user_unique_id = $1
      AND created_at BETWEEN $2 AND $3
    GROUP BY day
    ORDER BY day
  `, [userId, from, to]);
  return rows;
}

module.exports = {
  creditCommission,
  getMyWallet,
  upsertBankDetails,
  getBankDetails,
  requestWithdrawal,
  listWithdrawalRequests,
  reviewWithdrawalRequest,
  releaseWithheld,
  getStats,
};
