// src/services/walletService.js
const { pool } = require('../config/database');

// ─── Config ─────────────────────────────────────────────────────
const COMMISSION_RATES = { android: 10000, ios: 15000 };
const HIERARCHY_COMM   = { admin: 1500, superAdmin: 1000 };
const WITHDRAWAL_FEE   = 100;

// ─── Helpers ────────────────────────────────────────────────────
async function ensureWallet(userId) {
  if (!userId) {
    throw new Error("Missing user_unique_id in ensureWallet");
  }
  const query = `
    INSERT INTO wallets
      (user_unique_id, total_balance, available_balance, withheld_balance, created_at, updated_at)
    VALUES
      ($1, 0, 0, 0, NOW(), NOW())
    ON CONFLICT (user_unique_id) DO NOTHING;
  `;
  await pool.query(query, [userId]);
}

async function creditSplit(userId, orderId, totalComm, typeTag) {
  await ensureWallet(userId);
  const available = Math.floor(totalComm * 0.4);
  const withheld  = totalComm - available;

  // bump balances
  await pool.query(`
    UPDATE wallets
       SET total_balance     = total_balance     + $1,
           available_balance = available_balance + $2,
           withheld_balance  = withheld_balance  + $3,
           updated_at        = NOW()
     WHERE user_unique_id = $4
  `, [ totalComm, available, withheld, userId ]);

  // log transactions
  const meta = JSON.stringify({ orderId });
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES
      ($1, $2, $3,          $4::jsonb),
      ($1, $5, $3 || '_available', $4::jsonb),
      ($1, $6, $3 || '_withheld',  $4::jsonb)
  `, [ userId, totalComm, typeTag, meta, available, withheld ]);

  return { totalComm, available, withheld };
}

async function creditFull(userId, orderId, amount, typeTag) {
  await ensureWallet(userId);
  // full amount to available
  await pool.query(`
    UPDATE wallets
       SET total_balance     = total_balance     + $1,
           available_balance = available_balance + $1,
           updated_at        = NOW()
     WHERE user_unique_id = $2
  `, [ amount, userId ]);
  // log it
  const meta = JSON.stringify({ orderId });
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES ($1, $2, $3, $4::jsonb)
  `, [ userId, amount, typeTag, meta ]);
  return { totalComm: amount };
}

// ─── Commission Credits ─────────────────────────────────────────
async function creditMarketerCommission(marketerUid, orderId, deviceType, qty) {
  const rate = COMMISSION_RATES[deviceType.toLowerCase()] || 0;
  const total = rate * qty;
  return creditSplit(marketerUid, orderId, total, 'commission');
}

async function creditAdminCommission(marketerUid, orderId, qty) {
  // find the admin
  const { rows } = await pool.query(`
    SELECT u2.unique_id AS adminUid
      FROM users m
      JOIN users u2 ON m.admin_id = u2.id
     WHERE m.unique_id = $1
  `, [ marketerUid ]);
  if (!rows[0]) return { totalComm: 0 };
  const total = HIERARCHY_COMM.admin * qty;
  return creditFull(rows[0].adminUid, orderId, total, 'admin_commission');
}

async function creditSuperAdminCommission(marketerUid, orderId, qty) {
  // find the superadmin
  const { rows } = await pool.query(`
    SELECT su.unique_id AS superUid
      FROM users m
      JOIN users a  ON m.admin_id        = a.id
      JOIN users su ON a.super_admin_id = su.id
     WHERE m.unique_id = $1
  `, [ marketerUid ]);
  if (!rows[0]) return { totalComm: 0 };
  const total = HIERARCHY_COMM.superAdmin * qty;
  return creditFull(rows[0].superUid, orderId, total, 'super_commission');
}

// ─── Query Wallet & History ────────────────────────────────────
async function getMyWallet(userId) {
  await ensureWallet(userId);
  const { rows: [wallet] } = await pool.query(`
    SELECT total_balance, available_balance, withheld_balance,
           account_name, account_number, bank_name
      FROM wallets
     WHERE user_unique_id = $1
  `, [ userId ]);
  const { rows: transactions } = await pool.query(`
    SELECT id, transaction_type, amount, created_at
      FROM wallet_transactions
     WHERE user_unique_id = $1
     ORDER BY created_at DESC
     LIMIT 50
  `, [ userId ]);
  return { wallet, transactions };
}

async function getMyWithdrawals(userId) {
  const { rows } = await pool.query(`
    SELECT id, amount_requested, fee, status, requested_at
      FROM withdrawal_requests
     WHERE user_unique_id = $1
     ORDER BY requested_at DESC
  `, [ userId ]);
  return rows;
}

// ─── Withdrawal Flow ──────────────────────────────────────────
async function requestWithdrawal(userId, amount, bankDetails) {
  await ensureWallet(userId);
  const { rows: [w] } = await pool.query(`
    SELECT available_balance
      FROM wallets
     WHERE user_unique_id = $1
  `, [ userId ]);

  if (!w || w.available_balance < amount + WITHDRAWAL_FEE) {
    throw new Error("Insufficient available balance (including ₦100 fee)");
  }

  // deduct immediately
  await pool.query(`
    UPDATE wallets
       SET available_balance = available_balance - $1,
           updated_at        = NOW()
     WHERE user_unique_id = $2
  `, [ amount + WITHDRAWAL_FEE, userId ]);

  // record request
  const { rows: [reqRow] } = await pool.query(`
    INSERT INTO withdrawal_requests
      (user_unique_id, amount_requested, fee, status,
       account_name, account_number, bank_name, requested_at)
    VALUES ($1, $2, $3, 'pending', $4, $5, $6, NOW())
    RETURNING *
  `, [
    userId, amount, WITHDRAWAL_FEE,
    bankDetails.account_name,
    bankDetails.account_number,
    bankDetails.bank_name
  ]);

  // log the fee
  const meta = JSON.stringify({ reqId: reqRow.id });
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES ($1, -$2, 'withdrawal_fee', $3::jsonb)
  `, [ userId, WITHDRAWAL_FEE, meta ]);

  return reqRow;
}

// ─── Master-Admin Endpoints ───────────────────────────────────
async function listPendingRequests() {
  const { rows } = await pool.query(`
    SELECT w.*, u.first_name || ' ' || u.last_name AS marketer_name
      FROM withdrawal_requests w
      JOIN users u ON u.unique_id = w.user_unique_id
     WHERE w.status = 'pending'
     ORDER BY w.requested_at DESC
  `);
  return rows;
}

async function reviewRequest(reqId, action, adminUid) {
  const { rows: [r] } = await pool.query(`
    SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'pending'
  `, [ reqId ]);
  if (!r) throw new Error("Request not found or already processed");

  if (action === 'approve') {
    await pool.query(`
      UPDATE withdrawal_requests
         SET status = 'approved',
             reviewed_by = $2,
             reviewed_at = NOW()
       WHERE id = $1
    `, [ reqId, adminUid ]);
  } else {
    // on rejection, refund the user
    await pool.query(`
      UPDATE wallets
         SET available_balance = available_balance + (amount_requested + fee),
             updated_at        = NOW()
       WHERE user_unique_id = $1
    `, [ r.user_unique_id ]);

    await pool.query(`
      UPDATE withdrawal_requests
         SET status = 'rejected',
             reviewed_by = $2,
             reviewed_at = NOW()
       WHERE id = $1
    `, [ reqId, adminUid ]);

    // log the refund of fee+amount
    const meta = JSON.stringify({ reqId });
    await pool.query(`
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type, meta)
      VALUES ($1, $2, 'withdraw_rejected', $3::jsonb)
    `, [ r.user_unique_id, r.amount_requested + r.fee, meta ]);
  }
}

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
      `, [ w.withheld_balance, w.user_unique_id ]);
      const meta = JSON.stringify({ released: w.withheld_balance });
      await client.query(`
        INSERT INTO wallet_transactions
          (user_unique_id, amount, transaction_type, meta)
        VALUES ($1, $2, 'release_withheld', $3::jsonb)
      `, [ w.user_unique_id, w.withheld_balance, meta ]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Utility ───────────────────────────────────────────────────
async function getFeeStats(from, to) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)           AS count,
      COALESCE(SUM(amount),0) AS total_fees
    FROM wallet_transactions
   WHERE transaction_type = 'withdrawal_fee'
     AND created_at BETWEEN $1 AND $2
  `, [ from, to ]);
  return rows[0];
}

async function resetWallet(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      UPDATE wallets
         SET total_balance = 0,
             available_balance = 0,
             withheld_balance  = 0,
             updated_at = NOW()
       WHERE user_unique_id = $1
    `, [ userId ]);
    await client.query(`
      DELETE FROM wallet_transactions WHERE user_unique_id = $1
    `, [ userId ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Release the withheld 60% for a single user.
 * Only MasterAdmin may call this, only on the last day of the month,
 * and only if the marketer has no pending stock-pickup issues.
 */
async function releaseWithheldForUser(userId) {
  // 1) Date check: must be last day of the month
  const now     = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  if (now.getDate() !== lastDay) {
    throw new Error("Withheld funds can only be released on the last day of the month.");
  }

  // 2) Ensure no pending stock-updates for that marketer
  const { rows: [marketer] } = await pool.query(
    `SELECT id FROM users WHERE unique_id = $1`, [userId]
  );
  if (!marketer) {
    throw new Error("Marketer not found.");
  }

  const { rows: pending } = await pool.query(
    `SELECT 1
       FROM stock_updates
      WHERE marketer_id = $1
        AND status IN ('pending','transfer_pending','transfer_approved')
   `,
    [marketer.id]
  );
  if (pending.length) {
    throw new Error("Cannot release withheld: marketer has live pickup-stock issues.");
  }

  // 3) Fetch their withheld balance
  const { rows: [wallet] } = await pool.query(
    `SELECT withheld_balance FROM wallets WHERE user_unique_id = $1`,
    [userId]
  );
  const toRelease = wallet?.withheld_balance || 0;
  if (!toRelease) {
    return { released: 0 };
  }

  // 4) Move withheld → available
  await pool.query(`
    UPDATE wallets
       SET available_balance = available_balance + $1,
           withheld_balance  = 0,
           updated_at        = NOW()
     WHERE user_unique_id = $2
  `, [toRelease, userId]);

  // 5) Log a transaction
  const meta = JSON.stringify({ released: toRelease });
  await pool.query(`
    INSERT INTO wallet_transactions
      (user_unique_id, amount, transaction_type, meta)
    VALUES ($1, $2, 'release_withheld', $3::jsonb)
  `, [userId, toRelease, meta]);

  return { released: toRelease };
}

//
// ——— Withdrawal Requests —————————————————————————————————————————————————
//

/**
 * Create a pending withdrawal request.
 * Does NOT touch balances yet—only logs the intent.
 */
async function createWithdrawalRequest(userId, amount, bankDetails) {
  // 1) ensure user exists & has enough available
  const FEE = 100;
  const { rows: [w] } = await pool.query(
    `SELECT available_balance
       FROM wallets
      WHERE user_unique_id = $1`,
    [userId]
  );
  if (!w || w.available_balance < amount + FEE) {
    throw new Error("Insufficient available balance (including ₦100 fee)");
  }

  // 2) insert into withdrawal_requests
  const { rows: [reqRow] } = await pool.query(`
    INSERT INTO withdrawal_requests
      ( user_unique_id,
        amount_requested,
        fee,
        net_amount,
        account_name,
        account_number,
        bank_name,
        status,
        requested_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'pending', NOW()
      )
    RETURNING *`,
    [
      userId,
      amount,
      FEE,
      amount,            // net to user; fee kept by platform
      bankDetails.account_name,
      bankDetails.account_number,
      bankDetails.bank_name
    ]
  );

  return reqRow;
}

/**
 * MasterAdmin reviews (approve / reject) a withdrawal request.
 */
async function reviewWithdrawalRequest(requestId, action, adminUid) {
  // 1) fetch pending request
  const { rows: [req] } = await pool.query(
    `SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'pending'`,
    [requestId]
  );
  if (!req) throw new Error("Request not found or not pending");

  // 2) if approve → debit user’s available, credit fee revenue, mark request approved
  if (action === 'approve') {
    await pool.query('BEGIN');
    try {
      // a) debit available_balance by (amount+fee)
      await pool.query(`
        UPDATE wallets
           SET available_balance = available_balance - ($1 + $2),
               updated_at        = NOW()
         WHERE user_unique_id = $3
      `, [req.amount_requested, req.fee, req.user_unique_id]);

      // b) record transaction
      await pool.query(`
        INSERT INTO wallet_transactions
          (user_unique_id, amount, transaction_type, meta)
        VALUES
          ($1, -$2, 'withdrawal',   $4::jsonb),
          ($1, -$3, 'withdrawal_fee',$4::jsonb)
      `, [
        req.user_unique_id,
        req.amount_requested,
        req.fee,
        JSON.stringify({ requestId })
      ]);

      // c) mark request approved
      await pool.query(`
        UPDATE withdrawal_requests
           SET status      = 'approved',
               reviewed_by = $2,
               reviewed_at = NOW()
         WHERE id = $1
      `, [requestId, adminUid]);

      await pool.query('COMMIT');
      return { requestId, approved: true };
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
  } else {
    // 3) if reject → simply mark request rejected
    await pool.query(`
      UPDATE withdrawal_requests
         SET status      = 'rejected',
             reviewed_by = $2,
             reviewed_at = NOW()
       WHERE id = $1
    `, [requestId, adminUid]);
    return { requestId, approved: false };
  }
}
module.exports = {
  creditMarketerCommission,
  creditAdminCommission,
  creditSuperAdminCommission,
  getMyWallet,
  getMyWithdrawals,
  requestWithdrawal,
  listPendingRequests,
  reviewRequest,
  releaseWithheld,
  getFeeStats,
  resetWallet,
  releaseWithheldForUser,
  createWithdrawalRequest,
  reviewWithdrawalRequest,
  creditSplit,               // ← add this if you ever need it
  creditFull,  
};
