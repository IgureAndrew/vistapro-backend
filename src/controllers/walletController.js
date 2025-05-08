// src/controllers/walletController.js

const walletService = require('../services/walletService');

/**
 * GET /api/wallets
 * Fetch your wallet + recent transactions
 */
async function getMyWallet(req, res, next) {
  try {
    const userId = req.user.unique_id;
    const { wallet, transactions } = await walletService.getMyWallet(userId);
    res.json({ wallet, transactions });
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
 * Create a new withdrawal request (pending)
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
      message: "Withdrawal request submitted (pending approval).",
      request
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallets/master-admin/requests
 * List all pending withdrawal requests (MasterAdmin)
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
 * Body: { action: 'approve' | 'reject' }
 */
async function reviewRequest(req, res, next) {
  try {
    const { reqId }  = req.params;
    const { action } = req.body;
    if (!['approve','reject'].includes(action)) {
      return res.status(400).json({ message: "Invalid action." });
    }
    const result = await walletService.reviewWithdrawalRequest(
      Number(reqId),
      action,
      req.user.unique_id
    );
    res.json({
      message: result.approved
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
 * Zero-out all wallets & delete all transactions (MasterAdmin)
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
  try {
    const all = await walletService.getAllWallets();
    res.json({ wallets: all });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/wallets/master-admin/release-withheld
 * Release all withheld balances into available for all users (MasterAdmin)
 */
async function releaseWithheld(req, res, next) {
  try {
    await walletService.releaseWithheld();
    res.json({ message: "All withheld balances released to available." });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMyWallet,
  getWalletStats,
  getMyWithdrawals,
  requestWithdrawal,
  listPendingRequests,
  reviewRequest,
  resetWallets,
  getAllWallets,
  releaseWithheld
};
