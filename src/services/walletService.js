// src/services/walletService.js

const { pool } = require('../config/database');

// ─── Config ─────────────────────────────────────────────────────
const WITHDRAWAL_FEE = 100;

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
 * Credits a split commission (40% available, 60% withheld) to the given user,
 * but only if no prior row exists for this order/typeTag.
 */
async function creditSplit(userId, orderId, totalComm, typeTag) {
  await ensureWallet(userId);

  const available = Math.floor(totalComm * 0.4);
  const withheld  = totalComm - available;
  const meta      = JSON.stringify({ orderId });

  // 1) attempt to insert the three ledger entries
  const insertRes = await pool.query(
    `INSERT INTO wallet_transactions
       (user_unique_id, amount, transaction_type, meta)
     VALUES
       ($1, $2, $3,       $4::jsonb),
       ($1, $5, $3 || '_available', $4::jsonb),
       ($1, $6, $3 || '_withheld',  $4::jsonb)
     ON CONFLICT (user_unique_id, transaction_type, (meta->>'orderId'))
       DO NOTHING
     RETURNING 1;`,
    [ userId, totalComm, typeTag, meta, available, withheld ]
  );

  // nothing new inserted → skip balances
  if (insertRes.rowCount === 0) {
    return { totalComm: 0, available: 0, withheld: 0 };
  }

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
 * Credits the full amount to the user's available balance,
 * but only if no prior row exists for this order/typeTag.
 */
async function creditFull(userId, orderId, amount, typeTag) {
  await ensureWallet(userId);
  const meta = JSON.stringify({ orderId });

  // 1) attempt the ledger entry
  const ins = await pool.query(
    `INSERT INTO wallet_transactions
       (user_unique_id, amount, transaction_type, meta)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (user_unique_id, transaction_type, (meta->>'orderId'))
       DO NOTHING
     RETURNING 1;`,
    [ userId, amount, typeTag, meta ]
  );

  if (ins.rowCount === 0) {
    return { totalComm: 0 };
  }

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

// Before:
//   SELECT status FROM orders WHERE id = $1
//   if (ord?.status !== 'released_confirmed') return;

// After:
async function creditMarketerCommission(marketerUid, orderId, deviceType, qty) {
  // Step A: guard on commission_paid — not on status
  const { rows: [ord] } = await pool.query(
    `SELECT commission_paid
       FROM orders
      WHERE id = $1`,
    [orderId]
  );
  if (ord?.commission_paid) {
    // Already paid → skip
    return { totalComm: 0, available: 0, withheld: 0 };
  }

  // Step B: fetch the marketer_rate for this deviceType
  const { rows: [cr] } = await pool.query(
    `SELECT marketer_rate
       FROM commission_rates
      WHERE LOWER(device_type) = LOWER($1)`,
    [deviceType]
  );
  const rate = cr?.marketer_rate || 0;
  const total = rate * qty;

  // Step C: insert three ledger rows (marketer_commission, _available, _withheld)
  return creditSplit(marketerUid, orderId, total, 'marketer_commission');
}

// Before:
//   SELECT status FROM orders WHERE id = $1
//   if (ord?.status !== 'released_confirmed') return;

// After:
async function creditAdminCommission(marketerUid, orderId, qty) {
  // Step A: guard on commission_paid
  const { rows: [ord] } = await pool.query(
    `SELECT commission_paid
       FROM orders
      WHERE id = $1`,
    [orderId]
  );
  if (ord?.commission_paid) {
    // Already paid → nothing to do
    return { totalComm: 0 };
  }

  // Step B: find this marketer’s Admin UID and admin_rate
  const { rows: [userRow] } = await pool.query(`
    SELECT
      u2.unique_id   AS adminUid,
      cr.admin_rate
    FROM orders o
    JOIN users m
      ON o.marketer_id = m.id
    JOIN users u2
      ON m.admin_id = u2.id
    LEFT JOIN stock_updates su
      ON o.stock_update_id = su.id
    JOIN products p
      ON p.id = COALESCE(o.product_id, su.product_id)
    JOIN commission_rates cr
      ON LOWER(cr.device_type) = LOWER(p.device_type)
    WHERE o.id = $1
      AND m.unique_id = $2
  `, [orderId, marketerUid]);

  const adminUid = userRow?.adminuid;
  const rate     = userRow?.admin_rate || 0;
  if (!adminUid) {
    return { totalComm: 0 };
  }

  // Step C: pay the full admin commission into available_balance
  const total = rate * qty;
  return creditFull(adminUid, orderId, total, 'admin_commission');
}

// Before:
//   SELECT status FROM orders WHERE id = $1
//   if (ord?.status !== 'released_confirmed') return;

// After:
async function creditSuperAdminCommission(marketerUid, orderId, qty) {
  // Step A: guard on commission_paid
  const { rows: [ord] } = await pool.query(
    `SELECT commission_paid
       FROM orders
      WHERE id = $1`,
    [orderId]
  );
  if (ord?.commission_paid) {
    // Already paid → skip
    return { totalComm: 0 };
  }

  // Step B: find this marketer’s SuperAdmin UID and superadmin_rate
  const { rows: [row] } = await pool.query(`
    SELECT
      su.unique_id      AS superUid,
      cr.superadmin_rate
    FROM orders o
    JOIN users m
      ON o.marketer_id = m.id
    JOIN users a
      ON m.admin_id = a.id
    JOIN users su
      ON a.super_admin_id = su.id
    LEFT JOIN stock_updates su_up
      ON o.stock_update_id = su_up.id
    JOIN products p
      ON p.id = COALESCE(o.product_id, su_up.product_id)
    JOIN commission_rates cr
      ON LOWER(cr.device_type) = LOWER(p.device_type)
    WHERE o.id = $1
      AND m.unique_id = $2
  `, [orderId, marketerUid]);

  const superUid = row?.superuid;
  const rate     = row?.superadmin_rate || 0;
  if (!superUid) {
    return { totalComm: 0 };
  }

  // Step C: pay full superadmin commission into available_balance
  const total = rate * qty;
  return creditFull(superUid, orderId, total, 'superadmin_commission');
}


async function getSubordinateWallets(superAdminUid) {
  // 1) Find internal ID of this SuperAdmin
  const { rows: [su] } = await pool.query(
    `SELECT id
       FROM users
      WHERE unique_id = $1
      LIMIT 1`,
    [superAdminUid]
  );
  if (!su) {
    throw new Error('SuperAdmin not found');
  }
  const superAdminId = su.id;

  // 2) Grab all Admins under this SuperAdmin
  const { rows: admins } = await pool.query(
    `SELECT id
       FROM users
      WHERE super_admin_id = $1`,
    [superAdminId]
  );
  const adminIds = admins.map(a => a.id);
  if (adminIds.length === 0) {
    return { wallets: [], transactions: [] };
  }

  // 3) Grab all Marketers under those Admin IDs
  const { rows: mkrs } = await pool.query(
    `SELECT id
       FROM users
      WHERE admin_id = ANY($1)`,
    [adminIds]
  );
  const marketerIds = mkrs.map(m => m.id);
  if (marketerIds.length === 0) {
    return { wallets: [], transactions: [] };
  }

  // 4A) Pull “balances” straight from wallets, *including* full name:
  const { rows: wallets } = await pool.query(
    `
    SELECT
      u.unique_id                         AS user_unique_id,
      u.first_name || ' ' || u.last_name  AS name,
      u.role                              AS role,
      w.total_balance::int                AS total_balance,
      w.available_balance::int            AS available_balance,
      w.withheld_balance::int             AS withheld_balance
    FROM wallets AS w
    JOIN users AS u
      ON u.unique_id = w.user_unique_id
    WHERE u.id = ANY($1)
    ORDER BY u.unique_id;
    `,
    [marketerIds]
  );

  // 4B) Fetch the 50 most recent transactions for those same marketers under this SuperAdmin:
  const { rows: transactions } = await pool.query(
    `
    SELECT
      wt.*,
      (wt.meta->>'orderId')::int            AS order_id,
      u.first_name || ' ' || u.last_name     AS name
    FROM wallet_transactions AS wt
    JOIN users AS u
      ON u.unique_id = wt.user_unique_id
    JOIN orders AS o
      ON (wt.meta->>'orderId')::int = o.id
    WHERE u.id = ANY($1)
      AND o.super_admin_id = $2
      AND wt.meta ? 'orderId'
      AND (wt.meta->>'orderId') ~ '^[0-9]+$'
    ORDER BY wt.created_at DESC
    LIMIT 50;
    `,
    [marketerIds, superAdminId]
  );

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
    SELECT
      id,
      transaction_type,
      amount,
      created_at
    FROM wallet_transactions
    WHERE user_unique_id = $1
    ORDER BY created_at DESC
    LIMIT 50
  `, [userId]);

  // 3) withdrawal history (now including net_amount)
  const { rows: rawWithdrawals } = await pool.query(`
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
    LIMIT 50
  `, [userId]);

  // 4) Coerce into numbers (now net_amount is present)
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

  // ─── 0) Enforce one‐per‐month for Admins & SuperAdmins ─────────────────────────
  const { rows: [userRow] } = await pool.query(
    `SELECT role FROM users WHERE unique_id = $1`,
    [userId]
  );
  const role = userRow?.role;
  if (role === 'Admin' || role === 'SuperAdmin') {
    const { rows: [recent] } = await pool.query(`
      SELECT COUNT(*)::int AS cnt
        FROM withdrawal_requests
       WHERE user_unique_id = $1
         AND requested_at >= date_trunc('month', now())
    `, [userId]);

    if (recent.cnt > 0) {
      const err = new Error(`${role}s may only make one withdrawal request per month.`);
      err.status = 429;  // Too Many Requests
      throw err;
    }
  }

  // ─── 1) Proceed with normal withdrawal flow ───────────────────────────────────
  const fee       = WITHDRAWAL_FEE;
  const totalCost = amount + fee;
  const client    = await pool.connect();

  try {
    await client.query('BEGIN');

    // a) lock & check available_balance
    const { rows: [w] } = await client.query(
      `SELECT available_balance FROM wallets WHERE user_unique_id = $1 FOR UPDATE`,
      [userId]
    );
    const avail = Number(w?.available_balance || 0);
    if (avail < totalCost) {
      const insuff = new Error(`Insufficient funds: ₦${avail.toLocaleString()}`);
      insuff.status = 400;
      throw insuff;
    }

    // b) insert the withdrawal request
    const { rows: [request] } = await client.query(
      `INSERT INTO withdrawal_requests
         (user_unique_id, amount_requested, fee, net_amount,
          account_name, account_number, bank_name,
          status, requested_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
       RETURNING *;`,
      [userId, amount, fee, amount, account_name, account_number, bank_name]
    );

    // c) deduct the total (amount + fee) from available_balance
    await client.query(
      `UPDATE wallets
          SET available_balance = available_balance - $2,
              updated_at        = NOW()
        WHERE user_unique_id = $1`,
      [userId, totalCost]
    );

    await client.query('COMMIT');
    return request;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
 * Get every user of a given role along with their wallet balances & pending cashouts.
 * (Used by Master-Admin to list all Marketers, Admins or SuperAdmins.)
 */
async function getWalletsByRole(role) {
  const { rows } = await pool.query(`
    SELECT
      u.unique_id                            AS user_unique_id,
      u.first_name || ' ' || u.last_name     AS name,
      u.role,
      w.total_balance,
      w.available_balance,
      w.withheld_balance,
      COALESCE(
        (SELECT SUM(r.net_amount)
           FROM withdrawal_requests r
          WHERE r.user_unique_id = u.unique_id
            AND r.status         = 'pending'
        ),
      0)::int                                 AS pending_cashout
    FROM wallets w
    JOIN users u
      ON u.unique_id = w.user_unique_id
    WHERE u.role = $1
    ORDER BY u.unique_id;
  `, [role]);

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


/**
 * Returns every Marketer who currently has a non‐zero withheld balance
 */
async function getMarketersWithheld() {
  const { rows } = await pool.query(`
    SELECT
      w.user_unique_id,
      w.withheld_balance::int AS amount
    FROM wallets w
    JOIN users u
      ON u.unique_id = w.user_unique_id
    WHERE u.role = 'Marketer'
      AND w.withheld_balance > 0
    ORDER BY u.first_name, u.last_name
  `);
  return rows;
}

// 2) Release all withheld for a single user
async function manualRelease(userUniqueId, reviewerUid) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows:[w] } = await client.query(`
      SELECT withheld_balance FROM wallets
       WHERE user_unique_id = $1
       FOR UPDATE
    `, [userUniqueId]);
    const amt = Number(w?.withheld_balance || 0);
    if (amt <= 0) {
      await client.query('ROLLBACK');
      return { released: 0 };
    }

    // a) move it into available_balance
    await client.query(`
      UPDATE wallets
         SET available_balance = available_balance + $2,
             withheld_balance  = 0,
             updated_at        = NOW()
       WHERE user_unique_id = $1
    `, [userUniqueId, amt]);

    // b) record a release transaction
    await client.query(`
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type, meta, created_at)
      VALUES
        ($1, $2, 'withheld_release', jsonb_build_object('reviewer', $3), NOW())
    `, [userUniqueId, amt, reviewerUid]);

    await client.query('COMMIT');
    return { released: amt };
  } catch(err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// 3) Reject (clear) all withheld for a single user—but do NOT touch the balance
// 3) Reject (undo) a withheld‐release by returning funds to withheld only
async function manualReject(userUniqueId, reviewerUid) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Find how much was released last time
    const { rows: [tx] } = await client.query(`
      SELECT amount
        FROM wallet_transactions
       WHERE user_unique_id   = $1
         AND transaction_type = 'withheld_release'
       ORDER BY created_at DESC
       LIMIT 1
    `, [userUniqueId]);
    const amt = Number(tx?.amount || 0);
    if (amt <= 0) {
      await client.query('ROLLBACK');
      return { rejected: 0 };
    }

    // 2) **Only** restore it into withheld_balance
    await client.query(`
      UPDATE wallets
         SET withheld_balance = withheld_balance + $2,
             updated_at       = NOW()
       WHERE user_unique_id = $1
    `, [userUniqueId, amt]);

    // 3) Log the rejection
    await client.query(`
      INSERT INTO wallet_transactions
        (user_unique_id, amount, transaction_type, meta, created_at)
      VALUES
        ($1, $2, 'withheld_reject', jsonb_build_object('reviewer', $3), NOW())
    `, [userUniqueId, amt, reviewerUid]);

    await client.query('COMMIT');
    return { rejected: amt };
  } catch(err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
  getMarketersWithheld,
  manualRelease,
  manualReject
  
};
