// src/controllers/walletController.js
const svc = require("../services/walletService");

/** MARKETER endpoints **/

// GET  /api/wallets
async function getMyWallet(req, res, next) {
  try {
    const data = await svc.getMyWallet(req.user.unique_id);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

// GET  /api/wallets/withdrawals
async function getMyWithdrawals(req, res, next) {
  try {
    const rows = await svc.getMyWithdrawals(req.user.unique_id);
    res.json({ requests: rows });
  } catch (e) {
    next(e);
  }
}

// POST /api/wallets/withdraw
async function requestWithdrawal(req, res, next) {
  try {
    const bank   = req.body.bankDetails || {};
    const { amount } = req.body;
    const reqRow = await svc.requestWithdrawal(req.user.unique_id, amount, bank);
    res.status(201).json({ request: reqRow });
  } catch (e) {
    next(e);
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
    if (req.user.role !== "MasterAdmin") return res.sendStatus(403);
    const { released } = await svc.releaseWithheld(req.params.userId);
    res.json({ message: `Released ₦${released.toLocaleString()}`, released });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // marketer
  getMyWallet,
  getMyWithdrawals,
  requestWithdrawal,
  getWalletStats,
  // admin & master-admin
  getAllWallets,
  listPendingRequests,
  reviewRequest,
  releaseWithheld,
};
