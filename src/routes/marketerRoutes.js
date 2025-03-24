// src/routes/marketerRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path'); // Added this line
const fs = require('fs');     // Added this line

const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const { updateProfile, placeOrder, submitBioData, submitGuarantorForm, submitCommitmentForm } = require('../controllers/marketerController');

// Define the directory for commitment form uploads
const commitmentUploadDir = path.join(__dirname, "../../uploads/commitment_forms");
if (!fs.existsSync(commitmentUploadDir)) {
  fs.mkdirSync(commitmentUploadDir, { recursive: true });
}

// Define the directory for guarantor form uploads
const guarantorUploadDir = path.join(__dirname, "../../uploads/guarantor_forms");
if (!fs.existsSync(guarantorUploadDir)) {
  fs.mkdirSync(guarantorUploadDir, { recursive: true });
}

// Define the directory to store uploaded files (passport photos and ID documents)
const marketerUploadDir = path.join(__dirname, "../../uploads/marketer_documents");
if (!fs.existsSync(marketerUploadDir)) {
  fs.mkdirSync(marketerUploadDir, { recursive: true });
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Protected route: Marketer profile update (with optional file upload for profile image)
router.put('/profile', verifyToken, verifyRole(['Marketer']), upload.single('profileImage'), updateProfile);

// Protected route: Place a new order (for sold items)
router.post('/order', verifyToken, verifyRole(['Marketer']), placeOrder);

// POST endpoint for Bio Data Form submission
// Expecting two file fields: passport_photo and id_document
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

// Define route for Guarantor Form submission:
// Expects file fields "id_document", "passport_photo", and "signature"
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

// POST endpoint for Commitment Form submission
// Expects a file field "signature" for the Direct Sales Rep's signature
router.post(
  "/commitment",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.single("signature"),
  submitCommitmentForm
);

module.exports = router;
