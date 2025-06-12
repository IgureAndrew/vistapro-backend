// src/routes/superAdminRoutes.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { verifyToken }    = require('../middlewares/authMiddleware');
const { verifyRole }     = require('../middlewares/roleMiddleware');
const {
  getAccountSettings,
  updateAccountSettings,
   listHierarchy,
   getOrderHistoryForSuperAdmin,
  registerAdmin
} = require('../controllers/superAdminController');

// ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup for accountImage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) => {
    const safeName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({ storage });

// ─── SuperAdmin Account Endpoints ─────────────────────────────────

// GET /api/super-admin/account
router.get(
  '/account',
  verifyToken,
  verifyRole(['SuperAdmin']),
  getAccountSettings
);

// PUT /api/super-admin/account
// (optionally accepts a file under field name 'profileImage')
router.put(
  '/account',
  verifyToken,
  verifyRole(['SuperAdmin']),
  upload.single('profileImage'),
  updateAccountSettings
);

// ─── Register a new Admin ──────────────────────────────────────

// POST /api/super-admin/register-admin
router.post(
  '/register-admin',
  verifyToken,
  verifyRole(['SuperAdmin']),
  registerAdmin
);

// **New hierarchy route**:
router.get(
  '/hierarchy',
  verifyToken,
  verifyRole(['SuperAdmin']),
  listHierarchy
);

router.get(
  '/orders/history',
  verifyToken,
  verifyRole(['SuperAdmin']),
  getOrderHistoryForSuperAdmin
);
module.exports = router;
