const svc = require('../services/walletService');

async function getMyWallet(req, res, next) {
  try {
    const data = await svc.getMyWallet(req.user.unique_id);
    res.json(data);
  } catch (e) { next(e) }
}

async function getMyWithdrawals(req, res, next) {
  try {
    const rows = await svc.getMyWithdrawals(req.user.unique_id);
    res.json({ requests: rows });
  } catch (e) { next(e) }
}

async function requestWithdrawal(req, res, next) {
  try {
    const bank   = req.body.bankDetails || {}; // pull from marketer’s profile or request
    const { amount } = req.body;
    const reqRow = await svc.requestWithdrawal(req.user.unique_id, amount, bank);
    res.status(201).json({ request: reqRow });
  } catch (e) { next(e) }
}

// Admin:
async function listPending(req, res, next) {
  try {
    const rows = await svc.listPendingRequests();
    res.json({ requests: rows });
  } catch (e) { next(e) }
}

async function review(req, res, next) {
  try {
    await svc.reviewRequest(Number(req.params.reqId), req.body.action, req.user.unique_id);
    res.json({ message: `Withdrawal ${req.body.action}d.` });
  } catch (e) { next(e) }
}

async function getWalletStats(req, res, next) {
  try {
    const { from, to } = req.query;
    // make sure your service expects (userId, from, to)
    const stats = await walletService.getStats(req.user.unique_id, from, to);
    return res.json(stats);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMyWallet,
  getMyWithdrawals,
  requestWithdrawal,
  listPending,
  getWalletStats,
  review
};
