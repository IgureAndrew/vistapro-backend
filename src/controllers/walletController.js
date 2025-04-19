// src/controllers/walletController.js
const walletService = require('../services/walletService');

async function getMyWallet(req, res, next) {
  try {
    const data = await walletService.getMyWallet(req.user.unique_id);
    res.json(data);
  } catch (err) { next(err) }
}

async function createOrUpdateBankDetails(req, res, next) {
  try {
    await walletService.upsertBankDetails(req.user.unique_id, req.body);
    res.json({ message: 'Bank details saved.' });
  } catch (err) { next(err) }
}

async function getBankDetails(req, res, next) {
  try {
    const bank = await walletService.getBankDetails(req.user.unique_id);
    res.json({ bank });
  } catch (err) { next(err) }
}

async function requestWithdrawal(req, res, next) {
  try {
    await walletService.requestWithdrawal(req.user.unique_id, Number(req.body.amount));
    // emit notification to admins via Socket.IO if you have io instance
    res.status(201).json({ message: 'Withdrawal requested.' });
  } catch (err) { next(err) }
}

async function listWithdrawalRequests(req, res, next) {
  try {
    const list = await walletService.listWithdrawalRequests();
    res.json({ requests: list });
  } catch (err) { next(err) }
}

async function reviewWithdrawalRequest(req, res, next) {
  try {
    await walletService.reviewWithdrawalRequest(
      Number(req.params.reqId),
      req.body.action,
      req.user.unique_id
    );
    res.json({ message: `Withdrawal ${req.body.action}d.` });
  } catch (err) { next(err) }
}

async function releaseWithheld(req, res, next) {
  try {
    await walletService.releaseWithheld();
    res.json({ message: 'Withheld balances released.' });
  } catch (err) { next(err) }
}

async function getStats(req, res, next) {
  try {
    const { from, to } = req.query;
    const rows = await walletService.getStats(
      req.user.unique_id,
      new Date(from),
      new Date(to)
    );
    res.json({ stats: rows });
  } catch (err) { next(err) }
}

module.exports = {
  getMyWallet,
  createOrUpdateBankDetails,
  getBankDetails,
  requestWithdrawal,
  listWithdrawalRequests,
  reviewWithdrawalRequest,
  releaseWithheld,
  getStats,
};
