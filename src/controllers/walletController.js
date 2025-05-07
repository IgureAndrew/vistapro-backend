// src/controllers/walletController.js
const svc = require("../services/walletService");

/** ─── MARKETER ENDPOINTS ─────────────────────────────────────── **/

// GET  /api/wallets
// Returns { wallet: { total_balance, available_balance, withheld_balance, account_name, account_number, bank_name }, transactions: [...] }
async function getMyWallet(req, res, next) {
  try {
    // svc.getMyWallet now SELECTs account_name, account_number, bank_name
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
    const rows = await svc.getMyWithdrawals(req.user.unique_id);
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
}

// POST /api/wallets/withdraw
// Expects { amount, account_name, account_number, bank_name }
async function requestWithdrawal(req, res, next) {
  try {
    const { amount, account_name, account_number, bank_name } = req.body;

    // basic validation
    if (!amount || !account_name || !account_number || !bank_name) {
      return res
        .status(400)
        .json({
          message:
            "Please provide amount, account_name, account_number and bank_name.",
        });
    }

    const bankDetails = { account_name, account_number, bank_name };
    const reqRow = await svc.requestWithdrawal(
      req.user.unique_id,
      amount,
      bankDetails
    );
    res.status(201).json({ request: reqRow });
  } catch (err) {
    next(err);
  }
}

// GET  /api/wallets/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
async function getWalletStats(req, res, next) {
  try {
    const { from, to } = req.query;
    const stats = await svc.getStats(req.user.unique_id, from, to);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

/** ─── ADMIN / MASTER-ADMIN ENDPOINTS ───────────────────────── **/

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

// PATCH /api/wallets/master-admin/requests/:reqId { action: 'approve' | 'reject' }
async function reviewRequest(req, res, next) {
  try {
    const { id } = req.params; 
    const action = req.body.action;
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
    await svc.releaseWithheld();
    res.json({ message: "All withheld balances released." });
  } catch (err) {
    next(err);
  }
}

// POST  /api/wallets/master-admin/reset
async function resetWallets(req, res, next) {
  if (req.user.role !== "MasterAdmin") {
    return res.status(403).json({ message: "Permission denied." });
  }
  try {
    await svc.resetWallets();
    res.json({ message: "All wallets and transactions have been reset." });
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
  resetWallets,
};
