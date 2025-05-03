// src/controllers/walletController.js
const svc = require("../services/walletService");

/** MARKETER endpoints **/

// GET  /api/wallets
async function getMyWallet(req, res, next) {
  try {
    const { wallet, transactions } = await svc.getMyWallet(req.user.unique_id);
    res.json({
      wallet: {
        total_balance:     wallet.total_balance,
        available_balance: wallet.available_balance,
        withheld_balance:  wallet.withheld_balance,
        account_name:      wallet.account_name   || null,
        account_number:    wallet.account_number || null,
        bank_name:         wallet.bank_name      || null,
      },
      transactions
    });
  } catch (err) {
    next(err);
  }
}

// GET  /api/wallets/withdrawals
async function getMyWithdrawals(req, res, next) {
  try {
    const requests = await svc.getMyWithdrawals(req.user.unique_id);
    res.json({ requests });
  } catch (err) {
    next(err);
  }
}

// POST /api/wallets/withdraw
async function requestWithdrawal(req, res, next) {
  try {
    const { amount, account_name, account_number, bank_name } = req.body;
    if (!amount || !account_name || !account_number || !bank_name) {
      return res.status(400).json({
        message:
          "Please provide amount, account_name, account_number and bank_name.",
      });
    }
    const bankDetails = { account_name, account_number, bank_name };
    const request = await svc.requestWithdrawal(
      req.user.unique_id,
      amount,
      bankDetails
    );
    res.status(201).json({ request });
  } catch (err) {
    next(err);
  }
}

// GET  /api/wallets/stats
async function getWalletStats(req, res, next) {
  try {
    const { from, to } = req.query;
    const stats = await svc.getStats(req.user.unique_id, from, to);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}


/** ADMIN / MASTER-ADMIN endpoints **/

// GET  /api/wallets/master-admin/wallets
async function getAllWallets(req, res, next) {
  try {
    const wallets = await svc.getAllWallets();
    res.json({ wallets });
  } catch (err) {
    next(err);
  }
}

// GET  /api/wallets/master-admin/requests
async function listPendingRequests(req, res, next) {
  try {
    const requests = await svc.listPendingRequests();
    res.json({ requests });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/wallets/master-admin/requests/:reqId
async function reviewRequest(req, res, next) {
  try {
    const reqId  = Number(req.params.reqId);
    const action = req.body.action;       // 'approve' or 'reject'
    await svc.reviewRequest(reqId, action, req.user.unique_id);
    res.json({ message: `Withdrawal ${action}d.` });
  } catch (err) {
    next(err);
  }
}

// POST  /api/wallets/master-admin/release-withheld
async function releaseWithheld(req, res, next) {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.sendStatus(403);
    }
    // call with no args, since service zeroes *all* wallets
    await svc.releaseWithheld();
    res.json({ message: "All withheld balances have been released." });
  } catch (err) {
    next(err);
  }
}

// POST /api/wallets/master-admin/reset
async function resetWallets(req, res, next) {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Permission denied." });
    }
    await svc.resetWallets();
    res.json({ message: "All wallets and transactions have been reset to zero." });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Marketer
  getMyWallet,
  getMyWithdrawals,
  requestWithdrawal,
  getWalletStats,

  // Admin & MasterAdmin
  getAllWallets,
  listPendingRequests,
  reviewRequest,
  releaseWithheld,
  resetWallets,
};
