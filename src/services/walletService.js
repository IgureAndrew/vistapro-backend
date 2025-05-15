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
  // 1) find our internal SuperAdmin ID
  const { rows: [su] } = await pool.query(
    `SELECT id FROM users WHERE unique_id = $1`,
    [superAdminUid]
  );
  if (!su) throw new Error('SuperAdmin not found');

  // 2) pull all Admins under this SuperAdmin
  const { rows: admins } = await pool.query(
    `SELECT id, unique_id
       FROM users
      WHERE super_admin_id = $1`,
    [su.id]
  );
  const adminIds = admins.map(a => a.id);

  if (adminIds.length === 0) {
    return { wallets: [], transactions: [] };
  }

  // 3) pull all Marketers under those Admins
  const { rows: mkrs } = await pool.query(
    `SELECT id, unique_id, first_name||' '||last_name AS name
       FROM users
      WHERE admin_id = ANY($1)`,
    [adminIds]
  );
  const marketerIds   = mkrs.map(m => m.id);
  const marketerUids  = mkrs.map(m => m.unique_id);
  const marketerNames = mkrs.reduce((acc,m)=>{ acc[m.unique_id]=m.name; return acc },{})

  if (marketerIds.length === 0) {
    return { wallets: [], transactions: [] };
  }

  // 4) aggregate only those wallet_transactions belonging to orders
  //    that used this SuperAdmin (via their Admin → o.super_admin_id)
  const { rows: wallets } = await pool.query(`
    SELECT
      u.unique_id                         AS user_unique_id,
      $2::int                             AS super_admin_id,
      $3::varchar                        AS super_admin_uid,

      -- total of all types of commission under this superadmin
      COALESCE(
        SUM(wt.amount)
        FILTER (
          WHERE o.super_admin_id = $2
            AND wt.user_unique_id = u.unique_id
        ),
        0
      ) AS total_balance,

      -- only the "available" transactions under this superadmin
      COALESCE(
        SUM(wt.amount)
        FILTER (
          WHERE o.super_admin_id = $2
            AND wt.transaction_type = 'commission_available'
            AND wt.user_unique_id = u.unique_id
        ),
        0
      ) AS available_balance,

      -- only the "withheld" transactions under this superadmin
      COALESCE(
        SUM(wt.amount)
        FILTER (
          WHERE o.super_admin_id = $2
            AND wt.transaction_type = 'commission_withheld'
            AND wt.user_unique_id = u.unique_id
        ),
        0
      ) AS withheld_balance

    FROM users u
    LEFT JOIN wallet_transactions wt
      ON wt.user_unique_id = u.unique_id
    LEFT JOIN orders o
      ON (wt.meta->>'orderId')::int = o.id

    WHERE u.id = ANY($1)  -- only the marketers we fetched
    GROUP BY u.unique_id
    ORDER BY u.unique_id
  `, [
    marketerIds,
    su.id,
    superAdminUid
  ]);

  // 5) fetch the most recent 50 transactions (optional)
  const { rows: transactions } = await pool.query(`
    SELECT 
      wt.*,
      (wt.meta->>'orderId')::int AS order_id,
      u.first_name||' '||u.last_name AS name
    FROM wallet_transactions wt
    JOIN users u
      ON u.unique_id = wt.user_unique_id
    JOIN orders o
      ON (wt.meta->>'orderId')::int = o.id
    WHERE u.id = ANY($1)
      AND o.super_admin_id = $2
    ORDER BY wt.created_at DESC
    LIMIT 50
  `, [
    marketerIds,
    su.id
  ]);

  return { wallets, transactions };
}

/**
 * Fetch a user’s wallet, ledger transactions, and withdrawal history
 */
async function getMyWallet(userId) {
  await ensureWallet(userId);

  // 1) balances + bank info
  const { rows: [wallet] } = await pool.query(`
    SELECT
      total_balance,
      available_balance,
      withheld_balance,
      account_name,
      account_number,
      bank_name
    FROM wallets
    WHERE user_unique_id = $1
  `, [userId]);

  // 2) ledger transactions
  const { rows: transactions } = await pool.query(`
    SELECT id, transaction_type, amount, created_at
      FROM wallet_transactions
     WHERE user_unique_id = $1
     ORDER BY created_at DESC
     LIMIT 50
  `, [userId]);

  // 3) withdrawal history (raw, with string fields)
  const { rows: rawWithdrawals } = await pool.query(`
    SELECT
      id,
      amount_requested::int   AS amount,
      fee::int                AS fee,
       status,
      requested_at
    FROM withdrawal_requests
    WHERE user_unique_id = $1
    ORDER BY requested_at DESC
    LIMIT 50
  `, [userId]);
  // 4) coerce amount, fee, net_amount into real numbers
  const withdrawals = rawWithdrawals.map(r => ({
    ...r,
    amount:     Number(r.amount),
    fee:        Number(r.fee),
    net_amount: Number(r.net_amount),
  }));

  return { wallet, transactions, withdrawals };
}


// If you still need the old standalone version, make sure it’s distinct:
async function getMyWithdrawals(userId) {
  await ensureWallet(userId);
  const { rows } = await pool.query(`
    SELECT
      id,
      amount_requested::int   AS amount,
     fee::int                AS fee,
     net_amount::int         AS net_amount,
      status,
      requested_at
    FROM withdrawal_requests
    WHERE user_unique_id = $1
    ORDER BY requested_at DESC
  `, [userId]);
  return rows;
}


async function getAllWallets() {
  const { rows } = await pool.query(`
    SELECT
      w.user_unique_id,
      u.first_name || ' ' || u.last_name AS name,
      u.role,
      w.total_balance,
      w.available_balance,
      w.withheld_balance,
      COALESCE(
        SUM(r.net_amount) FILTER (WHERE r.status = 'pending'),
        0
      ) AS pending_cashout
    FROM wallets w
    JOIN users u
      ON u.unique_id = w.user_unique_id
     AND u.role = 'Marketer'
    LEFT JOIN withdrawal_requests r
      ON r.user_unique_id = w.user_unique_id
    GROUP BY
      w.user_unique_id,
      name,
      u.role,
      w.total_balance,
      w.available_balance,
      w.withheld_balance
    ORDER BY w.user_unique_id;
  `);

  return rows.map(r => ({
    user_unique_id:    r.user_unique_id,
    name:              r.name,
    role:              r.role,
    total_balance:     Number(r.total_balance),
    available_balance: Number(r.available_balance),
    withheld_balance:  Number(r.withheld_balance),
    pending_cashout:   Number(r.pending_cashout),
  }));
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
// ─── Inside walletService.js ───────────────────────────────────
async function createWithdrawalRequest(userId, amount, { account_name, account_number, bank_name }) {
  await ensureWallet(userId);

  const fee        = WITHDRAWAL_FEE;             // ₦100
  const totalCost  = amount + fee;               // e.g. 3 000 + 100 = 3 100

  // 1) fetch current available balance
  const { rows: [w] } = await pool.query(
    `SELECT available_balance
       FROM wallets
      WHERE user_unique_id = $1`,
    [userId]
  );
  const avail = Number(w?.available_balance || 0);

  // 2) block if not enough funds
  if (avail < totalCost) {
    const err = new Error(`Insufficient funds: you have ₦${avail.toLocaleString()}, you tried to withdraw ₦${amount.toLocaleString()} + ₦${fee} fee`);
    err.status = 400;
    throw err;
  }

  // 3) record the withdrawal request
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
     RETURNING
       id, user_unique_id, amount_requested, fee, net_amount, status, requested_at;`,
    [
      userId,
      amount,      // what they asked for
      fee,         // platform fee
      amount,      // net they actually get
      account_name,
      account_number,
      bank_name
    ]
  );

  // 4) deduct totalCost from available balance
  await pool.query(
    `UPDATE wallets
        SET available_balance = available_balance - $2,
            updated_at        = NOW()
      WHERE user_unique_id = $1`,
    [userId, totalCost]
  );

  return request;
}

// ─── Return sum of all fees collected:
//   - today
//   - this week
//   - this month
//   - this year
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
    FROM withdrawal_requests;
  `);
  return stats;
}

/**
 * GET all withdrawal requests still pending approval
 */
async function listPendingRequests() {
  const { rows } = await pool.query(`
    SELECT
      id,
      user_unique_id,
      amount_requested::int   AS amount,
      fee::int                AS fee,
      net_amount::int         AS net_amount,
      status,
      account_name,
      account_number,
      bank_name,
      requested_at
    FROM withdrawal_requests
    WHERE status = 'pending'
    ORDER BY requested_at DESC
  `);
  return rows;
}

/**
 * Approve or reject a withdrawal request.
 * - If approved, mark status, reviewed_by, reviewed_at.
 * - If rejected, mark status, reviewed_by, reviewed_at,
 *   and refund the full amount+fee back to available_balance.
 */
async function reviewWithdrawalRequest(requestId, action, reviewerUid) {
  // 1) fetch existing request
  const { rows: [reqRow] } = await pool.query(
    `SELECT user_unique_id, amount_requested, fee, net_amount
       FROM withdrawal_requests
      WHERE id = $1`,
    [requestId]
  );
  if (!reqRow) throw new Error("Withdrawal request not found");

  // 2) update the request row
  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  await pool.query(
    `UPDATE withdrawal_requests
        SET status      = $2,
            reviewed_by = $3,
            reviewed_at = NOW()
      WHERE id = $1`,
    [requestId, newStatus, reviewerUid]
  );

  // 3) If rejected, refund both amount+fee back to the user's available_balance
  if (action === 'reject') {
    //const refund = reqRow.amount_requested + reqRow.fee;
    const refund =
      Number(reqRow.amount_requested) +
      Number(reqRow.fee);
    await pool.query(
      `UPDATE wallets
          SET available_balance = available_balance + $2,
              updated_at        = NOW()
        WHERE user_unique_id = $1`,
      [reqRow.user_unique_id, refund]
    );
  }

  return { requestId, status: newStatus };
}

/**
 * Fetch confirmed or rejected withdrawal requests,
 * joined with user info, and filtered by date/name/role.
 */
// src/services/walletService.js
async function getWithdrawalHistory({ startDate, endDate, name, role }) {
  const conditions = [`wr.status IN ('approved','rejected')`];
  const params     = [];

  if (startDate) {
    params.push(startDate);
    conditions.push(`wr.requested_at >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`wr.requested_at <= $${params.length}`);
  }
  if (name) {
    params.push(`%${name}%`);
    conditions.push(`(u.first_name || ' ' || u.last_name) ILIKE $${params.length}`);
  }
  if (role) {
    params.push(role);
    conditions.push(`u.role = $${params.length}`);
  }

  const sql = `
    SELECT
      wr.id,
      wr.user_unique_id                AS unique_id,
      u.first_name || ' ' || u.last_name AS name,
      u.role,
      u.phone,
      wr.account_name,
      wr.bank_name,
      wr.account_number,
      wr.amount_requested::int           AS amount,
      wr.fee::int                        AS fee,
      wr.net_amount::int                 AS net_amount,
      wr.status,
      wr.requested_at                    AS date
    FROM withdrawal_requests wr
    JOIN users u
      ON u.unique_id = wr.user_unique_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY wr.requested_at DESC
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Get every user of a given role along with their wallet balances & pending cashouts
 */
/**
 * Get every user of a given role along with their wallet balances & pending cashouts
 */
/**
 * Get every user of a given role along with their wallet balances
 * *only* from orders that passed through the given superAdminUid
 */
async function getWalletsByRole(role, superAdminUid) {
  // 1) look up the internal SuperAdmin id
  const { rows: [su] } = await pool.query(
    `SELECT id FROM users WHERE unique_id = $1`,
    [superAdminUid]
  );
  if (!su) throw new Error('SuperAdmin not found');

  // 2) now aggregate per‐marketer/admin/superadmin under this superAdmin
  const { rows } = await pool.query(`
    SELECT
      u.unique_id                           AS user_unique_id,
      u.first_name || ' ' || u.last_name    AS name,
      u.role,
      
      -- total of all wallet_transactions for orders under this SA
      COALESCE( SUM(wt.amount), 0 ) AS total_balance,
      
      -- available split
      COALESCE( SUM(wt.amount) FILTER (
        WHERE wt.transaction_type = 'commission_available'
      ), 0 ) AS available_balance,
      
      -- withheld split
      COALESCE( SUM(wt.amount) FILTER (
        WHERE wt.transaction_type = 'commission_withheld'
      ), 0 ) AS withheld_balance,

      -- any pending withdrawal on their wallet
      COALESCE( SUM(r.net_amount) FILTER (WHERE r.status = 'pending'), 0 )
      AS pending_cashout

    FROM wallets w
    JOIN users u 
      ON u.unique_id = w.user_unique_id
     AND u.role = $1

    LEFT JOIN wallet_transactions wt
      ON wt.user_unique_id = w.user_unique_id

    LEFT JOIN orders o
      ON (wt.meta->>'orderId')::int = o.id

    LEFT JOIN users m
      ON o.marketer_id = m.id

    LEFT JOIN users a
      ON m.admin_id = a.id
     AND a.super_admin_id = $2       -- <<< filter here

    LEFT JOIN withdrawal_requests r
      ON r.user_unique_id = w.user_unique_id

    WHERE a.id IS NOT NULL             -- only those under this SA

    GROUP BY u.unique_id, name, u.role
    ORDER BY u.unique_id;
  `, [role, su.id]);

  return rows.map(r => ({
    user_unique_id:    r.user_unique_id,
    name:              r.name,
    role:              r.role,
    total_balance:     Number(r.total_balance),
    available_balance: Number(r.available_balance),
    withheld_balance:  Number(r.withheld_balance),
    pending_cashout:   Number(r.pending_cashout),
  }));
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
  listPendingRequests,
  reviewWithdrawalRequest,
  getWithdrawalHistory,
  getWalletsByRole,
};
