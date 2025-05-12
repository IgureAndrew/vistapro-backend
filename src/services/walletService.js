// src/services/walletService.js

const { pool } = require('../config/database');

// ─── Config ─────────────────────────────────────────────────────
// Marketer commission: ₦10 000 on Android, ₦15 000 on iOS
const COMMISSION_RATES = { android: 10000, ios: 15000 };
const HIERARCHY_COMM   = { admin: 1500, superAdmin: 1000 };
const WITHDRAWAL_FEE   = 100;

// ─── Helpers ────────────────────────────────────────────────────
async function ensureWallet(userId) {
  if (typeof userId !== 'string' || !userId.trim()) {
    console.error('🛑 ensureWallet called with invalid user_unique_id:', userId);
    throw new Error('Missing or invalid user_unique_id in ensureWallet');
  }
  await pool.query(
    `INSERT INTO wallets
      (user_unique_id, total_balance, available_balance, withheld_balance, created_at, updated_at)
     VALUES
      ($1, 0, 0, 0, NOW(), NOW())
     ON CONFLICT (user_unique_id) DO NOTHING;`,
    [userId]
  );
}

/**
 * Credits a split commission (40% available, 60% withheld) to the given user.
 */
async function creditSplit(userId, orderId, totalComm, typeTag) {
  await ensureWallet(userId);

  const available = Math.floor(totalComm * 0.4);
  const withheld  = totalComm - available;
  const meta      = JSON.stringify({ orderId });

  // 1) insert the three ledger entries
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_unique_id, amount, transaction_type, meta)
     VALUES
       ($1, $2, $3,       $4::jsonb),
       ($1, $5, $3 || '_available', $4::jsonb),
       ($1, $6, $3 || '_withheld',  $4::jsonb)
     ON CONFLICT (user_unique_id, transaction_type, (meta->>'orderId'))
       DO NOTHING;`,
    [ userId, totalComm, typeTag, meta, available, withheld ]
  );

  // 2) bump the running balances
  await pool.query(
    `UPDATE wallets
        SET total_balance     = total_balance     + $2,
            available_balance = available_balance + $3,
            withheld_balance  = withheld_balance  + $4,
            updated_at        = NOW()
      WHERE user_unique_id = $1;`,
    [ userId, totalComm, available, withheld ]
  );

  return { totalComm, available, withheld };
}

/**
 * Credits the full amount to the user's available balance.
 */
async function creditFull(userId, orderId, amount, typeTag) {
  await ensureWallet(userId);
  const meta = JSON.stringify({ orderId });

  // 1) ledger entry
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_unique_id, amount, transaction_type, meta)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (user_unique_id, transaction_type, (meta->>'orderId'))
       DO NOTHING;`,
    [ userId, amount, typeTag, meta ]
  );

  // 2) bump balances
  await pool.query(
    `UPDATE wallets
        SET total_balance     = total_balance     + $2,
            available_balance = available_balance + $2,
            updated_at        = NOW()
      WHERE user_unique_id = $1;`,
    [ userId, amount ]
  );

  return { totalComm: amount };
}

// ─── Commission Credits ─────────────────────────────────────────
async function creditMarketerCommission(marketerUid, orderId, deviceType, qty) {
  const typeStr = deviceType != null ? String(deviceType) : "";
  const lower   = typeStr.toLowerCase();

  let key;
  if (lower.includes("ios")) {
    key = "ios";
  } else if (lower.includes("android")) {
    key = "android";
  } else {
    key = "";
  }

  const rate  = COMMISSION_RATES[key] || 0;
  const total = rate * qty;

  return creditSplit(marketerUid, orderId, total, "commission");
}

async function creditAdminCommission(marketerUid, orderId, qty) {
  const { rows } = await pool.query(
    `SELECT u2.unique_id AS adminUid
       FROM users m
       JOIN users u2 ON m.admin_id = u2.id
      WHERE m.unique_id = $1`,
    [marketerUid]
  );
  const adminUid = rows[0]?.adminuid;
  if (!adminUid) return { totalComm: 0 };

  const total = HIERARCHY_COMM.admin * qty;
  return creditFull(adminUid, orderId, total, 'admin_commission');
}

async function creditSuperAdminCommission(marketerUid, orderId, qty) {
  const { rows } = await pool.query(
    `SELECT su.unique_id AS superUid
       FROM users m
       JOIN users a  ON m.admin_id        = a.id
       JOIN users su ON a.super_admin_id = su.id
      WHERE m.unique_id = $1`,
    [marketerUid]
  );
  const superUid = rows[0]?.superuid;
  if (!superUid) return { totalComm: 0 };

  const total = HIERARCHY_COMM.superAdmin * qty;
  return creditFull(superUid, orderId, total, 'super_commission');
}

// ─── Queries ────────────────────────────────────────────────────
async function getSubordinateWallets(superAdminUid) {
  const { rows: [su] } = await pool.query(
    `SELECT id FROM users WHERE unique_id = $1`,
    [superAdminUid]
  );
  if (!su) throw new Error('SuperAdmin not found');

  const { rows: admins } = await pool.query(
    `SELECT unique_id FROM users WHERE super_admin_id = $1`,
    [su.id]
  );
  const adminUids = admins.map(r => r.unique_id);

  let marketerUids = [];
  if (adminUids.length) {
    const { rows: mkrs } = await pool.query(
      `SELECT unique_id
         FROM users
        WHERE admin_id IN (
          SELECT id FROM users WHERE unique_id = ANY($1)
        )`,
      [adminUids]
    );
    marketerUids = mkrs.map(r => r.unique_id);
  }

  const uids = [...adminUids, ...marketerUids];
  if (!uids.length) return { wallets: [], transactions: [] };

  const { rows: wallets } = await pool.query(
    `SELECT w.*, u.first_name||' '||u.last_name AS name, u.role
       FROM wallets w
       JOIN users u ON u.unique_id = w.user_unique_id
      WHERE w.user_unique_id = ANY($1)`,
    [uids]
  );

  const { rows: transactions } = await pool.query(
    `SELECT wt.*, u.first_name||' '||u.last_name AS name
       FROM wallet_transactions wt
       JOIN users u ON u.unique_id = wt.user_unique_id
      WHERE wt.user_unique_id = ANY($1)
      ORDER BY wt.created_at DESC
      LIMIT 50`,
    [uids]
  );

  return { wallets, transactions };
}

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
  await ensureWallet(userId);
  const { rows } = await pool.query(`
    SELECT id, amount_requested AS amount, fee, status, requested_at
      FROM withdrawal_requests
     WHERE user_unique_id = $1
     ORDER BY requested_at DESC
  `, [ userId ]);
  return rows;
}
async function getAllWallets() {
  // ensure you have the table populated
  // (optional) you could await ensureWallet for some default users here

  // pull every wallet + maybe user info
  const { rows: wallets } = await pool.query(`
    SELECT w.user_unique_id,
           w.total_balance,
           w.available_balance,
           w.withheld_balance,
           u.role
      FROM wallets w
      JOIN users u
        ON u.unique_id = w.user_unique_id
     WHERE u.role = 'Marketer'
     ORDER BY w.user_unique_id
  `);

  return wallets;
}

// ─── Queries ────────────────────────────────────────────────────
// ─── Wallets for Admin’s Marketers ─────────────────────────────

/**
 * Returns each marketer under this admin:
 *   • their wallet balances
 *   • date of last “commission” transaction
 */
async function getWalletsForAdmin(adminUid) {
  // 1) find your internal user.id
  const { rows: [adminRow] } = await pool.query(
    `SELECT id FROM users WHERE unique_id = $1`, [adminUid]
  );
  const adminId = adminRow?.id;
  if (!adminId) return [];

  // 2) pull all your marketers, plus their balance and last commission time
  const { rows: wallets } = await pool.query(`
    SELECT
      w.user_unique_id,
      w.total_balance,
      w.available_balance,
      w.withheld_balance,
      -- find the most recent commission transaction for this marketer:
      MAX(wt.created_at) FILTER (WHERE wt.transaction_type = 'admin_commission')
        AS last_commission_date
    FROM wallets w
    JOIN users u
      ON u.unique_id = w.user_unique_id
    LEFT JOIN wallet_transactions wt
      ON wt.user_unique_id = w.user_unique_id
    WHERE u.admin_id = $1
    GROUP BY w.user_unique_id, w.total_balance, w.available_balance, w.withheld_balance
    ORDER BY w.user_unique_id;
  `, [adminId]);

  return wallets;
}


/**
 * Create a withdrawal request for a user.
 * Deducts a flat fee, stores both fee and net_amount.
 */
async function createWithdrawalRequest(userId, amount, { account_name, account_number, bank_name }) {
  await ensureWallet(userId);

  const fee     = WITHDRAWAL_FEE;
  const net     = amount - fee;
  const now     = new Date();

  const { rows: [request] } = await pool.query(
    `INSERT INTO withdrawal_requests
       ( user_unique_id
       , amount_requested
       , fee
       , net_amount
       , account_name
       , account_number
       , bank_name
       , status
       , requested_at
       )
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
     RETURNING *;`,
    [
      userId,
      amount,
      fee,
      net,
      account_name,
      account_number,
      bank_name
    ]
  );

  //  – Optionally deduct the total from the user's available balance now…
  await pool.query(
    `UPDATE wallets
        SET available_balance = available_balance - $2,
            updated_at        = NOW()
      WHERE user_unique_id = $1`,
    [userId, amount + fee]
  );

  return request;
}

/**
 * Return sum of all fees collected:
 *   - today
 *   - this week
 *   - this month
 *   - this year
 */
async function getWithdrawalFeeStats() {
  const { rows: [stats] } = await pool.query(`
    SELECT
      COALESCE(SUM(fee) FILTER (
        WHERE CAST(requested_at AT TIME ZONE 'UTC' AS DATE) = CURRENT_DATE
      ), 0) AS daily,
      COALESCE(SUM(fee) FILTER (
        WHERE date_trunc('week', requested_at) = date_trunc('week', CURRENT_DATE)
      ), 0) AS weekly,
      COALESCE(SUM(fee) FILTER (
        WHERE date_trunc('month', requested_at) = date_trunc('month', CURRENT_DATE)
      ), 0) AS monthly,
      COALESCE(SUM(fee) FILTER (
        WHERE date_trunc('year', requested_at) = date_trunc('year', CURRENT_DATE)
      ), 0) AS yearly
  `);
  return stats;
}




module.exports = {
  ensureWallet,
  creditSplit,
  creditFull,
  creditMarketerCommission,
  creditAdminCommission,
  creditSuperAdminCommission,
  getSubordinateWallets,
  getMyWallet,
  getMyWithdrawals,
  getAllWallets,
  getWalletsForAdmin,
  createWithdrawalRequest,
  getWithdrawalFeeStats,
};
