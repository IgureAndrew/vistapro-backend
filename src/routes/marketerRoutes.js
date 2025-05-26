// src/routes/marketerRoutes.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole  } = require('../middlewares/roleMiddleware');

const {
  getAccountSettings,
  updateAccountSettings,
  getPlaceOrderData,
  createOrder,
  getOrderHistory,
  submitBioData,
  submitGuarantorForm,
  submitCommitmentForm,
  listDealersByState,
  listDealerProducts,
} = require('../controllers/marketerController');

// ensure upload dirs exist
['commitment_forms','guarantor_forms','marketer_documents'].forEach(dir => {
  const full = path.join(__dirname, '../../uploads', dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

// multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// ─ Account Settings ─────────────────────────────────────────────────────────
router.get(
  '/account-settings',
  verifyToken, verifyRole(['Marketer']),
  getAccountSettings
);
router.patch(
  '/account-settings',
  verifyToken, verifyRole(['Marketer']),
  upload.single('avatar'),
  updateAccountSettings
);

// ─ Place-Order Flow ─────────────────────────────────────────────────────────
// GET  /api/marketer/orders       → form data (stock vs free)
router.get(
  '/orders',
  verifyToken, verifyRole(['Marketer']),
  getPlaceOrderData
);
// POST /api/marketer/orders       → create a new order
router.post(
  '/orders',
  verifyToken, verifyRole(['Marketer']),
  createOrder
);

// ─ Order History ────────────────────────────────────────────────────────────
// GET /api/marketer/orders/history  → marketer’s past orders
router.get(
  '/orders/history',
  verifyToken, verifyRole(['Marketer']),
  getOrderHistory
);

// ─ Bio-Data Form ─────────────────────────────────────────────────────────────
router.post(
  '/bio-data',
  verifyToken, verifyRole(['Marketer']),
  upload.fields([
    { name: 'passport_photo', maxCount: 1 },
    { name: 'id_document',    maxCount: 1 },
  ]),
  submitBioData
);

// ─ Guarantor Form ───────────────────────────────────────────────────────────
router.post(
  '/guarantor-form',
  verifyToken, verifyRole(['Marketer']),
  upload.fields([
    { name: 'id_document',    maxCount: 1 },
    { name: 'passport_photo', maxCount: 1 },
    { name: 'signature',      maxCount: 1 },
  ]),
  submitGuarantorForm
);

// ─ Commitment Form ─────────────────────────────────────────────────────────
router.post(
  '/commitment',
  verifyToken, verifyRole(['Marketer']),
  upload.single('signature'),
  submitCommitmentForm
);

// ─ Dealer lookups ───────────────────────────────────────────────────────────
router.get(
  '/dealers',
  verifyToken, verifyRole(['Marketer']),
  listDealersByState
);
router.get(
  '/dealers/:dealerUniqueId/products',
  verifyToken, verifyRole(['Marketer']),
  listDealerProducts
);

module.exports = router;
