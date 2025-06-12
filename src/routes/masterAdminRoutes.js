// src/routes/masterAdminRoutes.js

const express = require('express');
const router = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole  } = require('../middlewares/roleMiddleware');
const pool            = require('../config/database').pool;

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
  listAdminsBySuperAdmin,
  getTotalUsers,
  getStats,
  getRecentActivity,
  getAllDealers
} = require('../controllers/masterAdminController');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

// Multer handlers
const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadPDF = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'registrationCertificate') {
      if (file.mimetype === 'application/pdf') {
        return cb(null, true);
      }
      return cb(new Error('Only PDF files allowed for registration certificate'), false);
    }
    cb(null, true);
  }
});

// --- Public ---
router.post('/register', registerMasterAdmin);

// --- Profile (MasterAdmin only) ---
router.put(
  '/profile',
  verifyToken,
  verifyRole(['MasterAdmin']),
  uploadImage.single('profileImage'),
  updateProfile
);
router.get(
  '/profile',
  verifyToken,
  verifyRole(['MasterAdmin']),
  (req, res) => res.status(200).json({ user: req.user })
);

// --- User Management (MasterAdmin only) ---
router.get(   '/users',         verifyToken, verifyRole(['MasterAdmin']), getUsers);
router.post(  '/users',         verifyToken, verifyRole(['MasterAdmin']), uploadPDF.single('registrationCertificate'), addUser);
router.get(   '/users/summary', verifyToken, verifyRole(['MasterAdmin']), getUserSummary);

// Use the numeric `:id` path parameter for update/delete
router.put(   '/users/:id',     verifyToken, verifyRole(['MasterAdmin']), updateUser);
router.delete('/users/:id',     verifyToken, verifyRole(['MasterAdmin']), deleteUser);

// Lock / Unlock by numeric ID
router.patch('/users/:id/lock',   verifyToken, verifyRole(['MasterAdmin']), lockUser);
router.patch('/users/:id/unlock', verifyToken, verifyRole(['MasterAdmin']), unlockUser);

// --- Dashboard & Stats ---
router.get('/dashboard-summary', verifyToken, verifyRole(['MasterAdmin']), getDashboardSummary);
router.get('/total-users',      verifyToken, verifyRole(['MasterAdmin']), getTotalUsers);
router.get('/stats',            verifyToken, verifyRole(['MasterAdmin']), getStats);
router.get('/recent-activity',  verifyToken,                               getRecentActivity);

// --- Assignments (MasterAdmin only) ---
router.post('/assign-marketers-to-admin',    verifyToken, verifyRole(['MasterAdmin']), assignMarketersToAdmin);
router.post('/unassign-marketers-from-admin',verifyToken, verifyRole(['MasterAdmin']), unassignMarketersFromAdmin);
router.post('/assign-admins-to-superadmin',  verifyToken, verifyRole(['MasterAdmin']), assignAdminToSuperAdmin);
router.post('/unassign-admins-from-superadmin', verifyToken, verifyRole(['MasterAdmin']), unassignAdminsFromSuperadmin);
router.get( '/assignments',                  verifyToken, verifyRole(['MasterAdmin']), getAllAssignments);

// --- List subsets ---
router.get(
  '/marketers/:adminUniqueId',
  verifyToken,
  verifyRole(['Admin','MasterAdmin']),
  listMarketersByAdmin
);
router.get(
  '/admins/:superAdminUniqueId',
  verifyToken,
  verifyRole(['MasterAdmin']),
  listAdminsBySuperAdmin
);

// --- Dealers for Marketers/Admins ---
router.get(
  '/dealers',
  verifyToken,
  verifyRole(['Marketer','Admin','MasterAdmin']),
  getAllDealers
);



// --- Global error handler ---
router.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal Server Error' });
});

module.exports = router;
