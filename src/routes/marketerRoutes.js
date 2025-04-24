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
  getPlaceOrderData,   // <-- renamed
  createOrder,         // <-- new
  getOrderHistory,     // <-- renamed
  submitBioData,
  submitGuarantorForm,
  submitCommitmentForm,
} = require('../controllers/marketerController');

// Ensure upload dirs exist
['commitment_forms','guarantor_forms','marketer_documents'].forEach(dir => {
  const full = path.join(__dirname, '../../uploads', dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// ────────────────
// Account Settings
// ────────────────
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

// ────────────────
// Place-Order Flow
// ────────────────
// GET form data (stock vs free)
router.get(
  '/orders',
  verifyToken, verifyRole(['Marketer']),
  getPlaceOrderData
);
// POST a new order
router.post(
  '/orders',
  verifyToken, verifyRole(['Marketer']),
  createOrder
);

// ────────────────
// Order History
// ────────────────
router.get(
  '/orders/history',
  verifyToken, verifyRole(['Marketer']),
  getOrderHistory
);

// ────────────────
// Bio Data Form
// ────────────────
router.post(
  '/bio-data',
  verifyToken, verifyRole(['Marketer']),
  upload.fields([
    { name: 'passport_photo', maxCount: 1 },
    { name: 'id_document',    maxCount: 1 },
  ]),
  submitBioData
);

// ────────────────
// Guarantor Form
// ────────────────
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

// ────────────────
// Commitment Form
// ────────────────
router.post(
  '/commitment',
  verifyToken, verifyRole(['Marketer']),
  upload.single('signature'),
  submitCommitmentForm
);

module.exports = router;
