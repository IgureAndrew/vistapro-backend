// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const { updateProfile, registerDealer, registerMarketer } = require('../controllers/adminController');

// Configure Multer for file uploads (for profile image upload)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Endpoint for Admin to update their profile (with optional facial profile image)
router.put('/profile', verifyToken, verifyRole(['Admin']), upload.single('profileImage'), updateProfile);

// Endpoint for Admin to register a new Dealer account
router.post('/register-dealer', verifyToken, verifyRole(['Admin']), registerDealer);

// Endpoint for Admin to register a new Marketer account
router.post('/register-marketer', verifyToken, verifyRole(['Admin']), registerMarketer);

module.exports = router;
