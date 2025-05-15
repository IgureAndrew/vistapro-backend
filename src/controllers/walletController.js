// src/controllers/walletController.js

const walletService = require('../services/walletService');

/**
 * GET /api/wallets
 * Fetch your wallet + recent transactions
 */
async function getMyWallet(req, res, next) {
  try {
    const userId = req.user.unique_id;
    const { wallet, transactions, withdrawals } =
      await walletService.getMyWallet(userId);
    res.json({ wallet, transactions, withdrawals });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallets/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Fetch your commission stats over a date range
 */
async function getWalletStats(req, res, next) {
  try {
    const userId = req.user.unique_id;
    const { from, to } = req.query;
    const stats = await walletService.getStats(userId, from, to);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallets/withdrawals
 * List your own withdrawal requests
 */
async function getMyWithdrawals(req, res, next) {
  try {
    const userId = req.user.unique_id;
    const requests = await walletService.getMyWithdrawals(userId);
    res.json({ requests });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/wallets/withdraw
 * Create a new withdrawal request (pending, ₦100 fee)
 */
async function requestWithdrawal(req, res, next) {
  try {
    const userId = req.user.unique_id;
    const { amount, account_name, account_number, bank_name } = req.body;
    const request = await walletService.createWithdrawalRequest(
      userId,
      Number(amount),
      { account_name, account_number, bank_name }
    );
    res.status(201).json({
      message: "Withdrawal request submitted (₦100 fee charged).",
      request
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallets/withdrawals/fees
 * Total ₦100 fees collected: daily, weekly, monthly, yearly
 */
async function getWithdrawalFeeStats(req, res, next) {
  try {
    const stats = await walletService.getWithdrawalFeeStats();
    res.json({ stats });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallets/master-admin/requests
 * List pending withdrawal requests (MasterAdmin)
 */
async function listPendingRequests(req, res, next) {
  try {
    const requests = await walletService.listPendingRequests();
    res.json({ requests });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/wallets/master-admin/requests/:reqId
 * Approve or reject a withdrawal (MasterAdmin)
 */
async function reviewRequest(req, res, next) {
  try {
    const { reqId }  = req.params;
    const { action } = req.body;

    if (!['approve','reject'].includes(action)) {
      return res.status(400).json({ message: "Invalid action." });
    }

    // delegate entirely to your service layer
    const result = await walletService.reviewWithdrawalRequest(
      Number(reqId),
      action,
      req.user.unique_id
    );

    res.json({
      message: result.status === 'approved'
        ? "Withdrawal approved and funds disbursed."
        : "Withdrawal request rejected.",
      result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/wallets/master-admin/reset
 * Reset all wallets & transactions (MasterAdmin)
 */
async function resetWallets(req, res, next) {
  try {
    await walletService.resetWallets();
    res.json({ message: "All wallets and transactions reset." });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallets/master-admin/wallets
 * List all marketers’ wallets (MasterAdmin)
 */
async function getAllWallets(req, res, next) {
  const wallets = await walletService.getWalletsByRole('Marketer')
  res.json({ wallets })
}
/**
 * POST /api/wallets/master-admin/release-withheld
 * Release withheld balances (MasterAdmin)
 */
async function releaseWithheld(req, res, next) {
  try {
    await walletService.releaseWithheld();
    res.json({ message: "All withheld balances released." });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallets/super-admin/activities
 * Subordinate wallets & transactions (SuperAdmin)
 */
async function getSuperAdminActivities(req, res, next) {
  try {
    const superAdminUid = req.user.unique_id;
    const { wallets, transactions } =
      await walletService.getSubordinateWallets(superAdminUid);
    res.json({ wallets, transactions });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallets/admin/marketers
 * Marketers under this admin + balances + last admin commission date
 */
async function getAdminWallets(req, res, next) {
  try {
    const adminUid = req.user.unique_id;
    const wallets = await walletService.getWalletsForAdmin(adminUid);
    res.json({ wallets });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallets/master-admin/requests
 * List all withdrawal requests still pending approval
 */
async function listPendingRequests(req, res, next) {
  try {
    const requests = await walletService.listPendingRequests();
    res.json({ requests });
  } catch (err) {
    next(err);
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
    };
    const data = await walletService.getWithdrawalHistory(filters);
    return res.json({ data });
  } catch (err) {
    next(err);
  }
}

// ─── MasterAdmin → marketers ───────────────────────────────────
async function getAllWallets(req, res, next) {
  try {
    // use the ROLE helper, passing the SA’s own UID
    const wallets = await walletService.getWalletsByRole(
      'Marketer',
      req.user.unique_id
    );
    res.json({ wallets });
  } catch (err) {
    next(err);
  }
}

// ─── MasterAdmin → admins ──────────────────────────────────────
async function getAllAdminWallets(req, res, next) {
  try {
    const wallets = await walletService.getWalletsByRole(
      'Admin',
      req.user.unique_id
    );
    res.json({ wallets });
  } catch (err) {
    next(err);
  }
}

// ─── MasterAdmin → superadmins ─────────────────────────────────
async function getAllSuperAdminWallets(req, res, next) {
  try {
    const wallets = await walletService.getWalletsByRole(
      'SuperAdmin',
      req.user.unique_id
    );
    res.json({ wallets });
  } catch (err) {
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
  getAllWallets,
  releaseWithheld,
  getSuperAdminActivities,
  getAdminWallets,
   getWithdrawalHistory,
    getAllAdminWallets,
  getAllSuperAdminWallets,
};
