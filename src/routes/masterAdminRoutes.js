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
  getUserSummary,
  getDashboardSummary,
  assignMarketersToAdmin,     // Multi‑assignment for marketers to admin
  assignAdminToSuperAdmin,     // Multi‑assignment for admins to super admin
  unassignMarketersFromAdmin,
  unassignAdminsFromSuperadmin // Multi‑unassignment for admins from super admin
} = require('../controllers/masterAdminController');

// Define the uploads directory and ensure it exists.
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer storage settings.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

// Multer for profile images (without file filter)
const uploadImage = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 5 }
});

// Multer for PDF upload (used for dealer registration certificate)
const uploadPDF = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 5 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "registrationCertificate") {
      if (file.mimetype === "application/pdf") {
        cb(null, true);
      } else {
        cb(new Error("Only PDF files are allowed for the registration certificate."), false);
      }
    } else {
      cb(null, true);
    }
  }
});

// Routes for Master Admin

// Public route: Register a new Master Admin using a secret key.
router.post('/register', registerMasterAdmin);

// Protected route: Update Master Admin profile (with optional file upload for profileImage).
router.put(
  '/profile',
  verifyToken,
  verifyRole(['MasterAdmin']),
  uploadImage.single('profileImage'),
  updateProfile
);

// Routes for user management.
router.get('/users', verifyToken, verifyRole(['MasterAdmin']), getUsers);
router.post(
  '/users',
  verifyToken,
  verifyRole(['MasterAdmin']),
  uploadPDF.single('registrationCertificate'),
  addUser
);

// Dashboard summary routes.
router.get('/dashboard-summary', verifyToken, verifyRole(['MasterAdmin']), getDashboardSummary);
router.get('/users/summary', verifyToken, verifyRole(['MasterAdmin']), getUserSummary);

router.put('/users/:id', verifyToken, verifyRole(['MasterAdmin']), updateUser);
router.delete('/users/:id', verifyToken, verifyRole(['MasterAdmin']), deleteUser);
router.patch('/users/:id/lock', verifyToken, verifyRole(['MasterAdmin']), lockUser);
router.patch('/users/:id/unlock', verifyToken, verifyRole(['MasterAdmin']), unlockUser);

// Assignment Routes

// POST endpoint to assign one or multiple marketers to an admin.
router.post('/assign-marketers-to-admin', verifyToken, verifyRole(['MasterAdmin']), assignMarketersToAdmin);

// POST endpoint to unassign one or multiple marketers from an admin.
router.post('/unassign-marketers-from-admin', verifyToken, verifyRole(['MasterAdmin']), unassignMarketersFromAdmin);

// POST endpoint to assign one or multiple admins to a super admin.
router.post('/assign-admins-to-superadmin', verifyToken, verifyRole(['MasterAdmin']), assignAdminToSuperAdmin);

// POST endpoint to unassign one or multiple admins from a super admin.
router.post('/unassign-admins-from-superadmin', verifyToken, verifyRole(['MasterAdmin']), unassignAdminsFromSuperadmin);

// Error handling middleware.
router.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send({ message: 'Internal Server Error' });
});

module.exports = router;
