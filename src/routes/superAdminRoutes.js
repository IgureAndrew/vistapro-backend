const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const { updateProfile, registerAdmin } = require('../controllers/superAdminController');

// Define the uploads directory and ensure it exists.
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer storage settings.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Super Admin profile update endpoint with file upload (profileImage)
router.put(
  '/profile',
  verifyToken,
  verifyRole(['SuperAdmin']),
  upload.single('profileImage'),
  updateProfile
);

// Endpoint for Super Admin to register a new Admin account
router.post(
  '/register-admin',
  verifyToken,
  verifyRole(['SuperAdmin']),
  registerAdmin
);

module.exports = router;
