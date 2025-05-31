// src/routes/walletRoutes.js
const express          = require('express')
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware')
const wc               = require('../controllers/walletController')

const router = express.Router()

// ─── Marketer endpoints ────────────────────────────────────────
router.get(
  '/',                           // GET  /api/wallets
  verifyToken,
  verifyRole(['Marketer']),
  wc.getMyWallet
)
router.get(
  '/stats',                      // GET  /api/wallets/stats
  verifyToken,
  verifyRole(['Marketer']),
  wc.getWalletStats
)
router.get(
  '/withdrawals',                // GET  /api/wallets/withdrawals
  verifyToken,
  verifyRole(['Marketer']),
  wc.getMyWithdrawals
)
router.post(
  '/withdraw',                   // POST /api/wallets/withdraw
  verifyToken,
  verifyRole(['Marketer']),
  wc.requestWithdrawal
)

// ─── MasterAdmin endpoints ────────────────────────────────────
// commission‐withdrawal review
router.get(
  '/master-admin/requests',      // GET  /api/wallets/master-admin/requests
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.listPendingRequests
)
router.patch(
  '/master-admin/requests/:reqId', // PATCH /api/wallets/master-admin/requests/:reqId
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.reviewRequest
)


// optional: reset all wallets to zero (if you really need it)
router.post(
  '/master-admin/reset',         // POST /api/wallets/master-admin/reset
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.resetWallets
)

// Tab 1: all marketers’ wallets
router.get(
  '/master-admin/marketers',     // GET /api/wallets/master-admin/marketers
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.listMarketerWallets
)

// Tab 2: all admins’ wallets
router.get(
  '/master-admin/admins',        // GET /api/wallets/master-admin/admins
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.listAdminWallets
)

// Tab 3: all super-admins’ wallets
router.get(
  '/master-admin/superadmins',   // GET /api/wallets/master-admin/superadmins
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.listSuperAdminWallets
)

// full withdrawal history (filtered)
router.get(
  '/master-admin/withdrawals',   // GET /api/wallets/master-admin/withdrawals
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.getWithdrawalHistory
)

// ─── SuperAdmin endpoints ─────────────────────────────────────
router.get(
  '/super-admin/activities',     // GET /api/wallets/super-admin/activities
  verifyToken,
  verifyRole(['SuperAdmin']),
  wc.getSuperAdminActivities
)
router.get(
  '/super-admin/my',             // GET /api/wallets/super-admin/my
  verifyToken,
  verifyRole(['SuperAdmin']),
  wc.getMyWallet
)

// ─── Admin endpoints ───────────────────────────────────────────
router.get(
  '/admin/my',                   // GET /api/wallets/admin/my
  verifyToken,
  verifyRole(['Admin']),
  wc.getMyWallet
)
router.get(
  '/admin/marketers',            // GET /api/wallets/admin/marketers
  verifyToken,
  verifyRole(['Admin']),
  wc.getAdminWallets
)
router.post(
  '/admin/withdraw',             // POST /api/wallets/admin/withdraw
  verifyToken,
  verifyRole(['Admin']),
  wc.requestWithdrawal
)

// ─── Common endpoints ──────────────────────────────────────────
// withdrawal‐fee stats
router.get(
  '/withdrawals/fees',           // GET /api/wallets/withdrawals/fees
  verifyToken,
  verifyRole(['Marketer','Admin','SuperAdmin']),
  wc.getWithdrawalFeeStats
)

// ─── MasterAdmin: manual withheld balances ─────────────────────

// GET /api/wallets/master-admin/marketers/withheld
router.get(
  '/master-admin/marketers/withheld',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.listMarketersWithheld
);

// Approve (release) all withheld for a marketer
router.patch(
  '/master-admin/marketers/:userUid/withheld/approve',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.approveManualRelease
);

// Reject (clear) all withheld for a marketer
router.patch(
  '/master-admin/marketers/:userUid/withheld/reject',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.rejectManualRelease
);

router.get(
  '/master-admin/releases/history',
  verifyToken,
  verifyRole(['MasterAdmin']),
  wc.listAllReleases
)

module.exports = router
