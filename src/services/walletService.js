// src/services/walletService.js
const { pool } = require('../config/database');

//
// ——— Configuration —————————————————————————————————————————————————
//

// per‐device commission for the marketer
const COMMISSION_RATES = {
  android: 10000,
  iphone:  15000,
};

// fixed per‐device commissions for Admin & SuperAdmin
const HIERARCHY_COMM = {
  admin:      1500,
  superAdmin: 1000,
};

//
// ——— Core Helpers —————————————————————————————————————————————————
//

/**
 * Ensure a wallet row exists for this user.
 */
async function ensureWallet(userId) {
  await pool.query(`
    INSERT INTO wallets
      (user_unique_id, total_balance, available_balance, withheld_balance, created_at, updated_at)
    VALUES ($1, 0, 0, 0, NOW(), NOW())
    ON CONFLICT (user_unique_id) DO NOTHING
  `, [userId]);
}

/**
 * Generic helper: credit a lump‐sum into someone’s wallet,
 * splitting 40% available / 60% withheld, and logging three txns.
 *
 * @param {string} userId
 * @param {number} orderId
 * @param {number} totalCommission
 * @param {string} typeTag  e.g. 'commission', 'admin_commission', 'super_commission'
 */
async function creditSplit(userId, orderId, totalCommission, typeTag) {
  await ensureWallet(userId);

  const available = Math.floor(totalCommission * 0.4);
  const withheld  = totalCommission - available;

  // bump balances
  await pool.query(`
    UPDATE wallets
       SET total_balance     = total_balance     + $1,
           available_balance = available_balance + $2,
           withheld_balance  = withheld_balance  + $3,
           updated_at        = NOW()
     WHERE user_unique_id = $4
  `, [ totalCommission, available, withheld, userId ]);

  // log transactions: full, available split, withheld split
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES
      ($1, $2, $3,            $4::jsonb),
      ($1, $5, $3 || '_available', '{}'::jsonb),
      ($1, $6, $3 || '_withheld',  '{}'::jsonb)
  `, [
    userId,
    totalCommission,
    typeTag,
    JSON.stringify({ orderId }),
    available,
    withheld
  ]);
}

//
// ——— Multi-Tier Commission Credits —————————————————————————————————
//

/**
 * Credit the marketer’s own commission.
 */
async function creditMarketerCommission(marketerUid, orderId, deviceType, quantity) {
  const rate = COMMISSION_RATES[deviceType.toLowerCase()] || 0;
  const commission = rate * quantity;
  await creditSplit(marketerUid, orderId, commission, 'commission');
  return commission;
}

/**
 * Credit the Admin’s commission.
 */
async function creditAdminCommission(marketerUid, orderId, quantity) {
  // find this marketer’s admin
  const { rows } = await pool.query(`
    SELECT u2.unique_id AS admin_uid
      FROM users m
      JOIN users u2 ON m.admin_id = u2.id
     WHERE m.unique_id = $1
  `, [marketerUid]);

  if (!rows.length) return 0;
  const adminUid = rows[0].admin_uid;
  const commission = HIERARCHY_COMM.admin * quantity;
  await creditSplit(adminUid, orderId, commission, 'admin_commission');
  return commission;
}

/**
 * Credit the SuperAdmin’s commission.
 */
async function creditSuperAdminCommission(marketerUid, orderId, quantity) {
  // find marketer → their admin → that admin’s superadmin
  const { rows } = await pool.query(`
    SELECT su.unique_id AS superadmin_uid
      FROM users m
      JOIN users a  ON m.admin_id = a.id
      JOIN users su ON a.admin_id = su.id
     WHERE m.unique_id = $1
  `, [marketerUid]);

  if (!rows.length) return 0;
  const superUid = rows[0].superadmin_uid;
  const commission = HIERARCHY_COMM.superAdmin * quantity;
  await creditSplit(superUid, orderId, commission, 'super_commission');
  return commission;
}

//
// ——— Other Existing Functions ———————————————————————————————————————
//

/**
 * Credit a raw commission (used in some legacy flows).
 */
async function creditCommissionFromAmount(userId, orderId, commission) {
  await ensureWallet(userId);
  const available = Math.floor(commission * 0.4);
  const withheld  = commission - available;

  await pool.query(`
    UPDATE wallets
       SET total_balance     = total_balance     + $1,
           available_balance = available_balance + $2,
           withheld_balance  = withheld_balance  + $3,
           updated_at        = NOW()
     WHERE user_unique_id = $4
  `, [commission, available, withheld, userId]);

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
 * Fetch a user’s wallet + recent transactions.
 */
async function getMyWallet(userId) {
  await pool.query(`
    INSERT INTO wallets(user_unique_id)
      VALUES ($1)
    ON CONFLICT (user_unique_id) DO NOTHING
  `, [userId]);

  const { rows: [wallet] } = await pool.query(`
    SELECT total_balance, available_balance, withheld_balance,
           account_name, account_number, bank_name
      FROM wallets
     WHERE user_unique_id = $1
  `, [userId]);

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
 * Marketer requests a withdrawal.
 */
async function requestWithdrawal(userId, amount, bankDetails) {
  const FEE = 100;
  const { rows: [w] } = await pool.query(`
    SELECT available_balance
      FROM wallets
     WHERE user_unique_id = $1
  `, [userId]);

  if (!w || w.available_balance < amount + FEE) {
    throw new Error("Insufficient available balance (including ₦100 fee)");
  }

  const net = amount + FEE;

  // persist bank details + adjust balances
  await pool.query(`
    UPDATE wallets
       SET account_name      = $2,
           account_number    = $3,
           bank_name         = $4,
           available_balance = available_balance - $5,
           withheld_balance  = withheld_balance + $5,
           updated_at        = NOW()
     WHERE user_unique_id = $1
  `, [
    userId,
    bankDetails.account_name,
    bankDetails.account_number,
    bankDetails.bank_name,
    net
  ]);

  // record the withdrawal request
  const { rows: [reqRow] } = await pool.query(`
    INSERT INTO withdrawal_requests
      (user_unique_id, amount_requested, fee, net_amount,
       status, account_name, account_number, bank_name, requested_at)
    VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, NOW())
    RETURNING *
  `, [
    userId, amount, FEE, net,
    bankDetails.account_name,
    bankDetails.account_number,
    bankDetails.bank_name,
  ]);

  // log the transaction
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES ($1, -$2, 'withdraw_request', $3::jsonb)
  `, [userId, net, JSON.stringify({ reqId: reqRow.id })]);

  return reqRow;
}

/**
 * List your withdrawals.
 */
async function getMyWithdrawals(userId) {
  const { rows } = await pool.query(`
    SELECT id,
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
 * List pending withdrawals (for Admin).
 */
async function listPendingRequests() {
  const { rows } = await pool.query(`
    SELECT w.id,
           w.user_unique_id,
           u.first_name AS marketer_name,
           w.amount_requested AS amount,
           w.fee,
           w.net_amount AS total,
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
 * Approve or reject a withdrawal (Admin).
 */
async function reviewRequest(reqId, action, adminId) {
  const { rows: [r] } = await pool.query(`
    SELECT * FROM withdrawal_requests
     WHERE id = $1 AND status = 'pending'
  `, [reqId]);

  if (!r) throw new Error("Request not found or already processed");

  if (action === 'approve') {
    // mark approved + log payout
    await pool.query(`
      UPDATE withdrawal_requests
         SET status = 'approved',
             reviewed_by = $2,
             reviewed_at = NOW()
       WHERE id = $1
    `, [reqId, adminId]);

    await pool.query(`
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type, meta)
      VALUES ($1, -$2, 'withdraw_approved', $3::jsonb)
    `, [r.user_unique_id, r.net_amount, JSON.stringify({ reqId })]);
  } else {
    // rollback balances + mark rejected
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
 * Release withheld balances (MasterAdmin only).
 */
async function releaseWithheld() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT user_unique_id, withheld_balance
        FROM wallets
       WHERE withheld_balance > 0
    `);

    for (const w of rows) {
      await client.query(`
        UPDATE wallets
           SET available_balance = available_balance + $1,
               withheld_balance  = 0,
               updated_at        = NOW()
         WHERE user_unique_id = $2
      `, [w.withheld_balance, w.user_unique_id]);

      await client.query(`
        INSERT INTO wallet_transactions
          (user_unique_id, amount, transaction_type, meta)
        VALUES ($1, $2, 'release_withheld', $3::jsonb)
      `, [
        w.user_unique_id,
        w.withheld_balance,
        JSON.stringify({ period: new Date().toISOString().slice(0,7) })
      ]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Fetch commission stats.
 */
async function getStats(userId, from, to) {
  const fromDate = from ? new Date(from) : new Date(0);
  const toDate   = to   ? new Date(to)   : new Date();

  const { rows } = await pool.query(`
    SELECT COALESCE(SUM(amount),0)::BIGINT AS total_commission
      FROM wallet_transactions
     WHERE user_unique_id  = $1
       AND transaction_type = 'commission'
       AND created_at BETWEEN $2 AND $3
  `, [
    userId,
    fromDate.toISOString(),
    toDate.toISOString()
  ]);

  return { commission: Number(rows[0].total_commission) };
}

/**
 * Reset all wallets & transactions (MasterAdmin only).
 */
async function resetWallets() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE wallets
                          SET total_balance     = 0,
                              available_balance = 0,
                              withheld_balance  = 0,
                              updated_at        = NOW()`);
    await client.query(`DELETE FROM wallet_transactions`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * List all marketers’ wallets (MasterAdmin).
 */
async function getAllWallets() {
  const { rows } = await pool.query(`
    SELECT w.user_unique_id,
           u.first_name || ' ' || u.last_name AS marketer_name,
           w.total_balance,
           w.available_balance,
           w.withheld_balance
      FROM wallets w
      JOIN users u ON u.unique_id = w.user_unique_id
     WHERE u.role = 'Marketer'
     ORDER BY u.first_name, u.last_name
  `);
  return rows;
}

module.exports = {
  creditMarketerCommission,
  creditAdminCommission,
  creditSuperAdminCommission,
  creditCommissionFromAmount,
  getMyWallet,
  requestWithdrawal,
  getMyWithdrawals,
  listPendingRequests,
  reviewRequest,
  releaseWithheld,
  getStats,
  resetWallets,
  getAllWallets,
};
