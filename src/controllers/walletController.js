// src/controllers/walletController.js
const { pool } = require('../config/database');
const walletService = require('../services/walletService');

/**
 * GET /api/wallet
 * returns { wallet: { total_balance, available_balance, withheld_balance }, transactions: [...] }
 */
async function getMyWallet(req, res, next) {
  try {
    const data = await walletService.getMyWallet(req.user.unique_id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallet/withdrawals
 * (Marketer only) — list your own withdrawal requests
 */
async function getMyWithdrawals(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        amount,
        fee,
        net_amount,
        status,
        requested_at
      FROM withdrawal_requests
      WHERE user_unique_id = $1
      ORDER BY requested_at DESC
    `, [req.user.unique_id]);
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/wallet/bank-details
 */
async function createOrUpdateBankDetails(req, res, next) {
  try {
    await walletService.upsertBankDetails(req.user.unique_id, req.body);
    res.json({ message: 'Bank details saved.' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallet/bank-details
 */
async function getBankDetails(req, res, next) {
  try {
    const bank = await walletService.getBankDetails(req.user.unique_id);
    res.json({ bank });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/wallet/withdraw
 */
async function requestWithdrawal(req, res, next) {
  try {
    const amount = Number(req.body.amount);
    const result = await walletService.requestWithdrawal(req.user.unique_id, amount);
    res.status(201).json({
      message: `Withdrawal requested (₦${result.fee} fee will apply).`,
      request: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallet/withdrawal-requests
 * (MasterAdmin only) — list all marketers’ withdrawal requests
 */
async function listAllWithdrawals(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         w.id,
         u.unique_id        AS marketer_unique_id,
         u.business_name    AS marketer_name,
         b.bank_name,
         b.account_name,
         b.account_no,
         w.amount,
         w.fee,
         (w.amount + w.fee) AS total,
         w.status,
         w.created_at
       FROM withdrawal_requests w
       JOIN users u
         ON u.id = w.marketer_id
       LEFT JOIN bank_details b
         ON b.marketer_id = w.marketer_id
       ORDER BY w.created_at DESC`
    );
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/wallet/withdrawal-requests/:reqId
 * body: { action: "approve"|"reject" }
 */
async function reviewWithdrawalRequest(req, res, next) {
  try {
    const { reqId } = req.params;
    const { action } = req.body;
    await walletService.reviewWithdrawalRequest(
      Number(reqId),
      action,
      req.user.unique_id
    );
    res.json({ message: `Withdrawal ${action}d.` });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/wallet/release
 * (System cron or admin only)
 */
async function releaseWithheld(req, res, next) {
  try {
    await walletService.releaseWithheld();
    res.json({ message: 'Withheld balances released.' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallet/stats?from=...&to=...
 */
async function getStats(req, res, next) {
  try {
    const { from, to } = req.query;
    const rows = await walletService.getStats(
      req.user.unique_id,
      new Date(from),
      new Date(to)
    );
    res.json({ stats: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMyWallet,
  getMyWithdrawals,
  createOrUpdateBankDetails,
  getBankDetails,
  requestWithdrawal,
  listAllWithdrawals,
  reviewWithdrawalRequest,
  releaseWithheld,
  getStats
};
