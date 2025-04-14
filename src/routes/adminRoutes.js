// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
// Note: Use the correct function name from your adminController.
const { updateAdminAccountSettings, registerDealer, registerMarketer } = require('../controllers/adminController');

// Configure Multer for file uploads (for profile image upload)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// PATCH /api/admin/profile - Update Admin account settings (avatar, display name, email, phone, password)
// Note: We now use 'avatar' for the file field.
router.patch(
  '/profile',
  verifyToken,
  verifyRole(['Admin']),
  upload.single('avatar'),
  updateAdminAccountSettings
);

// Endpoint for Admin to register a new Dealer account
router.post('/register-dealer', verifyToken, verifyRole(['Admin']), registerDealer);

// Endpoint for Admin to register a new Marketer account
router.post('/register-marketer', verifyToken, verifyRole(['Admin']), registerMarketer);

module.exports = router;
