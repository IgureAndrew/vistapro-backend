const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path'); // For directory paths
const fs = require('fs');     // For file system operations

const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');

// Import functions from the marketer controller.
const {
  getAccountSettings,
  updateAccountSettings,
  placeOrder,
  getPendingOrdersForMarketer,
  submitBioData,
  submitGuarantorForm,
  submitCommitmentForm,
} = require('../controllers/marketerController');

// Define directories for file uploads.
const commitmentUploadDir = path.join(__dirname, "../../uploads/commitment_forms");
if (!fs.existsSync(commitmentUploadDir)) {
  fs.mkdirSync(commitmentUploadDir, { recursive: true });
}

const guarantorUploadDir = path.join(__dirname, "../../uploads/guarantor_forms");
if (!fs.existsSync(guarantorUploadDir)) {
  fs.mkdirSync(guarantorUploadDir, { recursive: true });
}

const marketerUploadDir = path.join(__dirname, "../../uploads/marketer_documents");
if (!fs.existsSync(marketerUploadDir)) {
  fs.mkdirSync(marketerUploadDir, { recursive: true });
}

// Configure Multer for file uploads.
// Files will be stored in "uploads/" unless otherwise specified.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// ------------------------------
// Account Settings Endpoints
// ------------------------------

// GET /api/marketer/account-settings - Retrieve current account settings for the marketer.
router.get(
  '/account-settings',
  verifyToken,
  verifyRole(["Marketer"]),
  getAccountSettings
);

// PATCH /api/marketer/account-settings - Update account settings (avatar, display name, email, phone, password).
router.patch(
  '/account-settings',
  verifyToken,
  verifyRole(["Marketer"]),
  upload.single('avatar'),
  updateAccountSettings
);

// ------------------------------
// Other Marketer Endpoints
// ------------------------------

// Protected route: Place a new order.
router.post('/order', verifyToken, verifyRole(['Marketer']), placeOrder);

// POST endpoint for Bio Data Form submission.
// Expecting two file fields: "passport_photo" and "id_document".
router.post(
  "/bio-data",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.fields([
    { name: "passport_photo", maxCount: 1 },
    { name: "id_document", maxCount: 1 },
  ]),
  submitBioData
);

// Protected route for Guarantor Form submission.
// Expects file fields "id_document", "passport_photo", and "signature".
router.post(
  "/guarantor-form",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.fields([
    { name: "id_document", maxCount: 1 },
    { name: "passport_photo", maxCount: 1 },
    { name: "signature", maxCount: 1 },
  ]),
  submitGuarantorForm
);

// POST endpoint for Commitment Form submission.
// Expects a single file field "signature" for the Direct Sales Rep's signature.
router.post(
  "/commitment",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.single("signature"),
  submitCommitmentForm
);

// GET /api/marketer/orders - Retrieve pending orders for the logged-in marketer.
router.get(
  "/orders",
  verifyToken,
  getPendingOrdersForMarketer
);

module.exports = router;
