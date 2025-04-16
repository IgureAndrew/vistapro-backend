// src/routes/masterAdminRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');

// Import controller functions from masterAdminController.
// Ensure that your masterAdminController.js exports these functions exactly.
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
  assignMarketersToAdmin,
  assignAdminToSuperAdmin,
  unassignMarketersFromAdmin,
  unassignAdminsFromSuperadmin,
  listMarketersByAdmin,
  getAllAssignments,
  listAdminsBySuperAdmin
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

// Multer for profile images
const uploadImage = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 5 }
});

// Multer for PDF uploads (used for dealer registration certificate)
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

// Get current Master Admin profile.
router.get(
  '/profile',
  verifyToken,
  verifyRole(['MasterAdmin']),
  (req, res, next) => {
    res.status(200).json({ user: req.user });
  }
);

// User management routes.
router.get('/users', verifyToken, verifyRole(['MasterAdmin']), getUsers);
router.post(
  '/users',
  verifyToken,
  verifyRole(['MasterAdmin']),
  uploadPDF.single('registrationCertificate'),
  addUser
);

router.get('/dashboard-summary', verifyToken, verifyRole(['MasterAdmin']), getDashboardSummary);
router.get('/users/summary', verifyToken, verifyRole(['MasterAdmin']), getUserSummary);
router.put('/users/:id', verifyToken, verifyRole(['MasterAdmin']), updateUser);
router.delete('/users/:id', verifyToken, verifyRole(['MasterAdmin']), deleteUser);
router.patch('/users/:id/lock', verifyToken, verifyRole(['MasterAdmin']), lockUser);
router.patch('/users/:id/unlock', verifyToken, verifyRole(['MasterAdmin']), unlockUser);

// Assignment routes.
// Assign marketers to an admin.
router.post('/assign-marketers-to-admin', verifyToken, verifyRole(['MasterAdmin']), assignMarketersToAdmin);

// Unassign marketers from an admin.
router.post('/unassign-marketers-from-admin', verifyToken, verifyRole(['MasterAdmin']), unassignMarketersFromAdmin);

// Assign admins to a super admin.
router.post('/assign-admins-to-superadmin', verifyToken, verifyRole(['MasterAdmin']), assignAdminToSuperAdmin);

// Unassign admins from a super admin.
router.post('/unassign-admins-from-superadmin', verifyToken, verifyRole(['MasterAdmin']), unassignAdminsFromSuperadmin);

// New routes to list assigned users:
// Get marketers assigned to a specific Admin via that admin's unique ID.
router.get(
  "/marketers/:adminUniqueId",
  verifyToken,
  verifyRole(["Admin", "MasterAdmin"]),
  listMarketersByAdmin
);

// Get admins assigned to a specific SuperAdmin via the superadmin's unique ID.
router.get(
  "/admins/:superAdminUniqueId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  listAdminsBySuperAdmin
);

// New route: Get all current assignments
router.get(
  '/assignments',
  verifyToken,
  verifyRole(["MasterAdmin"]),
  getAllAssignments
);

// PATCH /api/admin/users/:uniqueId
// Allows a Master Admin to update any user's details using the user's unique ID.
router.patch(
  '/users/:uniqueId',
  verifyToken,
  verifyRole(['MasterAdmin']),
  updateUser
);

// Error handling middleware.
router.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send({ message: 'Internal Server Error' });
});

module.exports = router;
