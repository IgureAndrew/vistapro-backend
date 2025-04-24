// src/routes/marketerRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole }  = require('../middlewares/roleMiddleware');

// Import controller functions
const {
  getAccountSettings,
  updateAccountSettings,
  placeOrder,    // existing POST handler for placing orders
  getOrders,     // existing GET handler for order history
  submitBioData,
  submitGuarantorForm,
  submitCommitmentForm,
} = require('../controllers/marketerController');

// Ensure upload directories exist
["../../uploads/commitment_forms", "../../uploads/guarantor_forms", "../../uploads/marketer_documents"].forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// ------------------------------
// Account Settings
// ------------------------------
router.get(
  '/account-settings',
  verifyToken,
  verifyRole(['Marketer']),
  getAccountSettings
);

router.patch(
  '/account-settings',
  verifyToken,
  verifyRole(['Marketer']),
  upload.single('avatar'),
  updateAccountSettings
);

// ------------------------------
// Place Order
// ------------------------------
// POST /api/marketer/orders/placeorder - consume or free-order stock
router.post(
  '/orders/placeorder',
  verifyToken,
  verifyRole(['Marketer']),
  placeOrder
);

// ------------------------------
// Order History
// ------------------------------
// GET /api/marketer/orders - list this marketer's past orders
router.get(
  '/orders',
  verifyToken,
  verifyRole(['Marketer']),
  getOrders
);

// ------------------------------
// Bio Data Form
// ------------------------------
router.post(
  '/bio-data',
  verifyToken,
  verifyRole(['Marketer']),
  upload.fields([
    { name: 'passport_photo', maxCount: 1 },
    { name: 'id_document',    maxCount: 1 },
  ]),
  submitBioData
);

// ------------------------------
// Guarantor Form
// ------------------------------
router.post(
  '/guarantor-form',
  verifyToken,
  verifyRole(['Marketer']),
  upload.fields([
    { name: 'id_document',    maxCount: 1 },
    { name: 'passport_photo', maxCount: 1 },
    { name: 'signature',      maxCount: 1 },
  ]),
  submitGuarantorForm
);

// ------------------------------
// Commitment Form
// ------------------------------
router.post(
  '/commitment',
  verifyToken,
  verifyRole(['Marketer']),
  upload.single('signature'),
  submitCommitmentForm
);

module.exports = router;
