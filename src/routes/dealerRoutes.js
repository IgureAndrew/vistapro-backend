// src/routes/dealerProfileRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const { updateProfile } = require('../controllers/dealerController');

// Configure Multer to handle multiple file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Expect two fields: cacCertificate and profileImage
router.put(
  '/profile',
  verifyToken,
  verifyRole(['Dealer']),
  upload.fields([
    { name: 'cacCertificate', maxCount: 1 },
    { name: 'profileImage', maxCount: 1 }
  ]),
  updateProfile
);

module.exports = router;
