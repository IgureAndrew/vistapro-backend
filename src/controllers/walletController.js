// src/controllers/walletController.js

const { pool } = require('../config/database')       // ← make sure pool is defined
const walletService = require('../services/walletService')

/**
 * GET /api/wallets
 * Fetch your wallet + recent transactions
 */
async function getMyWallet(req, res, next) {
  try {
    const userId = req.user.unique_id
    const { wallet, transactions, withdrawals } =
      await walletService.getMyWallet(userId)
    res.json({ wallet, transactions, withdrawals })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/wallets/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Fetch your commission stats over a date range
 */
async function getWalletStats(req, res, next) {
  try {
    const userId = req.user.unique_id
    const { from, to } = req.query
    const stats = await walletService.getStats(userId, from, to)
    res.json(stats)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/wallets/withdrawals
 * List your own withdrawal requests
 */
async function getMyWithdrawals(req, res, next) {
  try {
    const userId = req.user.unique_id
    const requests = await walletService.getMyWithdrawals(userId)
    res.json({ requests })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/wallets/withdraw
 * Create a new withdrawal request (pending, ₦100 fee)
 */
async function requestWithdrawal(req, res, next) {
  try {
    const userId = req.user.unique_id
    const { amount, account_name, account_number, bank_name } = req.body
    const request = await walletService.createWithdrawalRequest(
      userId,
      Number(amount),
      { account_name, account_number, bank_name }
    )
    res.status(201).json({
      message: "Withdrawal request submitted (₦100 fee charged).",
      request
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/wallets/withdrawals/fees
 * Total ₦100 fees collected: daily, weekly, monthly, yearly
 */
async function getWithdrawalFeeStats(req, res, next) {
  try {
    const stats = await walletService.getWithdrawalFeeStats()
    res.json({ stats })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/wallets/master-admin/requests
 * List pending withdrawal requests (MasterAdmin)
 */
async function listPendingRequests(req, res, next) {
  try {
    const requests = await walletService.listPendingRequests()
    res.json({ requests })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/wallets/master-admin/requests/:reqId
 * Approve or reject a withdrawal (MasterAdmin)
 */
async function reviewRequest(req, res, next) {
  try {
    const { reqId } = req.params
    const { action } = req.body
    if (!['approve','reject'].includes(action)) {
      return res.status(400).json({ message: "Invalid action." })
    }
    const result = await walletService.reviewWithdrawalRequest(
      Number(reqId),
      action,
      req.user.unique_id
    )
    res.json({
      message: result.status === 'approved'
        ? "Withdrawal approved and funds disbursed."
        : "Withdrawal request rejected.",
      result
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/wallets/master-admin/reset
 * Reset all wallets & transactions (MasterAdmin)
 */
async function resetWallets(req, res, next) {
  try {
    await walletService.resetWallets()
    res.json({ message: "All wallets and transactions reset." })
  } catch (err) {
    next(err)
  }
}



async function getSuperAdminActivities(req, res, next) {
  try {
    const superAdminUid = req.user.unique_id;
    const { wallets, transactions } =
      await walletService.getSubordinateWallets(superAdminUid);
    return res.json({ wallets, transactions });
  }
  catch (err) {
    // If your service explicitly threw "SuperAdmin not found", return 404
    if (err.message === 'SuperAdmin not found') {
      return res.status(404).json({
        error: `No SuperAdmin found with unique_id = '${req.user.unique_id}'`
      });
    }

    // Otherwise, log the real SQL or JS error and return it as JSON
    console.error('ERROR in getSuperAdminActivities:', err);
    return res.status(500).json({
      error: 'Failed to load subordinate wallets & transactions.',
      details: err.message
    });
  }
}

/**
 * GET /api/wallets/admin/marketers
 * Marketers under this admin + balances + last admin commission date
 */
async function getAdminWallets(req, res, next) {
  try {
    const adminUid = req.user.unique_id
    const wallets  = await walletService.getWalletsForAdmin(adminUid)
    res.json({ wallets })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/wallets/master-admin/marketers
 * GET /api/wallets/master-admin/admins
 * GET /api/wallets/master-admin/superadmins
 * (MasterAdmin tabs)
 */
async function listMarketerWallets(req, res, next) {
  try {
    const wallets = await walletService.getWalletsByRole('Marketer')
    res.json({ wallets })
  } catch (err) {
    next(err)
  }
}

async function listAdminWallets(req, res, next) {
  try {
    const wallets = await walletService.getWalletsByRole('Admin')
    res.json({ wallets })
  } catch (err) {
    next(err)
  }
}

async function listSuperAdminWallets(req, res, next) {
  try {
    const wallets = await walletService.getWalletsByRole('SuperAdmin')
    res.json({ wallets })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/wallets/master-admin/withdrawals
 * Query params: startDate, endDate, name, role
 */
async function getWithdrawalHistory(req, res, next) {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate:   req.query.endDate,
      name:      req.query.name,
      role:      req.query.role
    }
    const data = await walletService.getWithdrawalHistory(filters)
    res.json({ data })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/wallets/master-admin/marketers/withheld
 * Return a list of all marketers (unique_id) along with their current withheld_balance.
 */
async function listMarketersWithheld(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.unique_id         AS user_unique_id,
        u.first_name || ' ' || u.last_name AS name,
        w.withheld_balance::int     AS withheld_balance
      FROM wallets w
      JOIN users u
        ON u.unique_id = w.user_unique_id
      WHERE u.role = 'Marketer'
        AND w.withheld_balance > 0
      ORDER BY u.unique_id
    `)
    // Attach the field “manual” (so the front‐end can do: res.data.manual)
    return res.json({ manual: rows })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/wallets/master-admin/marketers/:userUid/withheld/approve
 * Move the marketer’s withheld_balance → available_balance and set withheld_balance = 0,
 * AND record an “approved” row in withheld_release_requests.
 */
async function approveManualRelease(req, res, next) {
  const { userUid } = req.params;
  const reviewerUid = req.user.unique_id; // the MasterAdmin who is approving

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Lock that marketer’s wallet row FOR UPDATE
    const { rows: [ w ] } = await client.query(`
      SELECT
        available_balance::bigint   AS avail,
        withheld_balance::bigint    AS withheld
      FROM wallets
      WHERE user_unique_id = $1
      FOR UPDATE
    `, [userUid]);

    if (!w) {
      throw { status: 404, message: `Wallet not found for user ${userUid}` };
    }

    const { avail, withheld } = w;
    if (withheld <= 0) {
      // nothing to release
      await client.query('COMMIT');
      return res.status(400).json({ message: `No withheld balance to release for ${userUid}.` });
    }

    // 2) Update: available_balance += withheld; withheld_balance = 0
    await client.query(`
      UPDATE wallets
         SET available_balance = available_balance + $2,
             withheld_balance  = 0,
             updated_at        = NOW()
       WHERE user_unique_id = $1
    `, [userUid, withheld]);

    // 3) Insert a row into withheld_release_requests (history)
    await client.query(`
      INSERT INTO withheld_release_requests
        (user_unique_id, amount, status, requested_at, reviewed_at, reviewer_uid)
      VALUES
        ($1, $2, 'approved', NOW(), NOW(), $3)
    `, [userUid, withheld, reviewerUid]);

    await client.query('COMMIT');
    return res.json({ message: `Released ₦${withheld.toLocaleString()} for user ${userUid}.` });

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/wallets/master-admin/marketers/:userUid/withheld/reject
 * Simply zero out that marketer’s withheld_balance (no payout),
 * AND record a “rejected” row in withheld_release_requests.
 */
async function rejectManualRelease(req, res, next) {
  const { userUid } = req.params;
  const reviewerUid = req.user.unique_id; // the MasterAdmin who is rejecting

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Lock that marketer's wallet row FOR UPDATE to read current withheld_balance
    const { rows: [ w ] } = await client.query(`
      SELECT withheld_balance::bigint AS withheld
        FROM wallets
       WHERE user_unique_id = $1
       FOR UPDATE
    `, [userUid]);

    if (!w) {
      throw { status: 404, message: `Wallet not found for user ${userUid}` };
    }

    const { withheld } = w;
    if (withheld <= 0) {
      // nothing to reject
      await client.query('COMMIT');
      return res.status(400).json({ message: `No withheld balance to clear for ${userUid}.` });
    }

    // 2) Zero out withheld_balance
    await client.query(`
      UPDATE wallets
         SET withheld_balance = 0,
             updated_at       = NOW()
       WHERE user_unique_id = $1
    `, [userUid]);

    // 3) Insert a “rejected” row into withheld_release_requests (history)
    await client.query(`
      INSERT INTO withheld_release_requests
        (user_unique_id, amount, status, requested_at, reviewed_at, reviewer_uid)
      VALUES
        ($1, $2, 'rejected', NOW(), NOW(), $3)
    `, [userUid, withheld, reviewerUid]);

    await client.query('COMMIT');
    return res.json({ message: `Cleared (rejected) withheld ₦${withheld.toLocaleString()} for user ${userUid}.` });

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  } finally {
    client.release();
  }
}

/**
 * GET /api/wallets/master-admin/releases/history
 * Return every release request that is already APPROVED or REJECTED.
 */
async function listAllReleases(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        user_unique_id,
        amount::int      AS amount,
        status,          -- 'approved' or 'rejected'
        requested_at,
        reviewed_at,
        reviewer_uid
      FROM withheld_release_requests
      WHERE status IN ('approved','rejected')
      ORDER BY requested_at DESC
    `);

    // We return JSON under a field called "history"
    return res.json({ history: rows });

  } catch (err) {
    console.error('ERROR in listAllReleases:', err);
    next(err);
  }
}

module.exports = {
  getMyWallet,
  getWalletStats,
  getMyWithdrawals,
  requestWithdrawal,
  getWithdrawalFeeStats,
  listPendingRequests,
  reviewRequest,
  resetWallets,
  getSuperAdminActivities,
  getAdminWallets,
  listMarketerWallets,
  listAdminWallets,
  listSuperAdminWallets,
  getWithdrawalHistory,
   listMarketersWithheld,
  approveManualRelease,
  rejectManualRelease,
  listAllReleases,
}
