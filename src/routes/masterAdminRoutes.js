// src/routes/masterAdminRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');

// Import controller functions from masterAdminController
const {
  registerMasterAdmin,
  registerSuperAdmin,
  updateProfile,
  addUser,
  updateUser,
  deleteUser,
  lockUser,
  unlockUser,
  getUsers,
  assignMarketer,
} = require('../controllers/masterAdminController');

// Define the uploads directory and ensure it exists.
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer storage settings.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

// Routes for Master Admin

// Public route: Register a new Master Admin using a secret key.
router.post('/register', registerMasterAdmin);

// Protected route: Update Master Admin profile (with optional file upload for profileImage).
router.put(
  '/profile',
  verifyToken,
  verifyRole(['MasterAdmin']),
  upload.single('profileImage'),
  updateProfile
);

// Routes for user management (accessible by Master Admin).
router.get('/users', verifyToken, verifyRole(['MasterAdmin']), getUsers);
router.post('/users', verifyToken, verifyRole(['MasterAdmin']), addUser);
router.put('/users/:id', verifyToken, verifyRole(['MasterAdmin']), updateUser);
router.delete('/users/:id', verifyToken, verifyRole(['MasterAdmin']), deleteUser);
router.patch('/users/:id/lock', verifyToken, verifyRole(['MasterAdmin']), lockUser);
router.patch('/users/:id/unlock', verifyToken, verifyRole(['MasterAdmin']), unlockUser);

// PATCH endpoint to assign a marketer to an admin.
// URL: /api/master-admin/marketers/:marketerId/assign
router.patch(
  '/marketers/:marketerId/assign',
  verifyToken,
  verifyRole(['MasterAdmin']),
  assignMarketer
);

// Protected route: Register a Super Admin (only accessible by Master Admin).
router.post(
  '/register-super-admin',
  verifyToken,
  verifyRole(['MasterAdmin']),
  registerSuperAdmin
);

module.exports = router;
