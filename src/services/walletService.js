const { pool } = require('../config/database');

// ─── Config ─────────────────────────────────────────────────────
//Marketer commission: ₦10 000 on Android, ₦15 000 on iOS
const COMMISSION_RATES = { android: 10000, ios: 15000 };
const HIERARCHY_COMM   = { admin: 1500, superAdmin: 1000 };
const WITHDRAWAL_FEE   = 100;

// ─── Helpers ────────────────────────────────────────────────────
/**
 * Ensure a wallet row exists for the given user_unique_id.
 * Throws if userId is invalid.
 */
async function ensureWallet(userId) {
  if (typeof userId !== 'string' || !userId.trim()) {
    console.error('🛑 ensureWallet called with invalid user_unique_id:', userId);
    throw new Error('Missing or invalid user_unique_id in ensureWallet');
  }
  const sql = `
    INSERT INTO wallets
      (user_unique_id, total_balance, available_balance, withheld_balance, created_at, updated_at)
    VALUES
      ($1, 0, 0, 0, NOW(), NOW())
    ON CONFLICT (user_unique_id) DO NOTHING;
  `;
  await pool.query(sql, [userId]);
}

/**
 * Credits a split commission (40% available, 60% withheld) to the given user.
 */
async function creditSplit(userId, orderId, totalComm, typeTag) {
  if (!userId) throw new Error('Missing user_unique_id in creditSplit');
  await ensureWallet(userId);

  const available = Math.floor(totalComm * 0.4);
  const withheld  = totalComm - available;
  const meta      = JSON.stringify({ orderId });

  await pool.query(
    `UPDATE wallets
        SET total_balance     = total_balance     + $1,
            available_balance = available_balance + $2,
            withheld_balance  = withheld_balance  + $3,
            updated_at        = NOW()
      WHERE user_unique_id = $4`,
    [totalComm, available, withheld, userId]
  );

  // now try to insert all three transaction rows, but skip if already present
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_unique_id, amount, transaction_type, meta)
     VALUES
       ($1, $2, $3,       $4::jsonb),
       ($1, $5, $3 || '_available', $4::jsonb),
       ($1, $6, $3 || '_withheld',  $4::jsonb)
     ON CONFLICT ON CONSTRAINT ux_wallet_commission_per_order
       DO NOTHING;`,
    [userId, totalComm, typeTag, meta, available, withheld]
  );

  return { totalComm, available, withheld };
}

/**
 * Credits the full amount to the user's available balance.
 */
async function creditFull(userId, orderId, amount, typeTag) {
  if (!userId) throw new Error('Missing user_unique_id in creditFull');
  await ensureWallet(userId);

  await pool.query(
    `UPDATE wallets
        SET total_balance     = total_balance     + $1,
            available_balance = available_balance + $1,
            updated_at        = NOW()
      WHERE user_unique_id = $2`,
    [amount, userId]
  );

  const meta = JSON.stringify({ orderId });
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_unique_id, amount, transaction_type, meta)
     VALUES
       ($1, $2, $3, $4::jsonb)
     ON CONFLICT ON CONSTRAINT ux_wallet_commission_per_order
       DO NOTHING;`,
    [userId, amount, typeTag, meta]
  );

  return { totalComm: amount };
}


// ─── Commission Credits ─────────────────────────────────────────
async function creditMarketerCommission(marketerUid, orderId, deviceType, qty) {
  // 1) Coerce deviceType to a string (falling back to empty string)
  const typeStr = deviceType != null ? String(deviceType) : "";
  const lower   = typeStr.toLowerCase();

  // 2) Figure out which bucket to use
  //    You can tweak these includes() checks if you have more device types
  let key;
  if (lower.includes("ios")) {
    key = "ios";
  } else if (lower.includes("android")) {
    key = "android";
  } else {
    key = "";          // no commission if it's unknown
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

async function getSubordinateWallets(superAdminUid) {
  // 1) look up superadmin's internal ID
  const { rows: [su] } = await pool.query(
    `SELECT id FROM users WHERE unique_id = $1`,
    [superAdminUid]
  );
  if (!su) throw new Error('SuperAdmin not found');

  // 2) find all admins under this superAdmin
  const { rows: admins } = await pool.query(
    `SELECT unique_id FROM users WHERE super_admin_id = $1`,
    [su.id]
  );
  const adminUids = admins.map(r => r.unique_id);

  // 3) find all marketers under those admins
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

  // 4) fetch wallets & latest transactions for each
  const uids = [...adminUids, ...marketerUids];
  if (!uids.length) return { wallets: [], transactions: [] };

  // a) wallets
  const { rows: wallets } = await pool.query(
    `SELECT w.*, u.first_name||' '||u.last_name AS name, u.role
       FROM wallets w
       JOIN users u ON u.unique_id = w.user_unique_id
      WHERE w.user_unique_id = ANY($1)`,
    [uids]
  );

  // b) most recent 20 txns among them
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
// ─── Exports ─────────────────────────────────────────────────────
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
};
