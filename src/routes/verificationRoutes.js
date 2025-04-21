// src/routes/verificationRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");

// Use memory storage so that files are available as buffers (for Cloudinary uploads).
const memoryStorage = multer.memoryStorage();
const upload = multer({ storage: memoryStorage });

// Import authentication and role verification middleware.
const { verifyToken } = require("../middlewares/authMiddleware");
const { verifyRole } = require("../middlewares/roleMiddleware");

// Import all your controller functions from VerificationController
const {
  submitBiodata,
  submitGuarantor,
  submitCommitment,
  allowRefillForm,
  adminReview,
  superadminVerify,
  masterApprove,
  deleteBiodataSubmission,
  deleteGuarantorSubmission,
  deleteCommitmentSubmission,
  getAllSubmissionsForMasterAdmin,
  getSubmissionsForAdmin,
  getSubmissionsForSuperAdmin,
  biodataSuccess,
  guarantorSuccess,
  commitmentSuccess
} = require("../controllers/verificationController");

/**
 * *********************** Submission Endpoints *************************
 */

// POST /api/verification/bio-data
router.post(
  "/bio-data",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.fields([
    { name: "passport_photo", maxCount: 1 },
    { name: "id_document", maxCount: 1 },
  ]),
  submitBiodata
);

// POST /api/verification/guarantor
router.post(
  "/guarantor",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.fields([
    { name: "identification_file", maxCount: 1 },
    { name: "signature", maxCount: 1 },
  ]),
  submitGuarantor
);

// POST /api/verification/commitment-handbook
router.post(
  "/commitment-handbook",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.single("signature"),
  submitCommitment
);

/**
 * *********************** Admin / Master Admin Endpoints *************************
 */

// PATCH /api/verification/allow-refill
router.patch(
  "/allow-refill",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  allowRefillForm
);

// PATCH /api/verification/admin-review
router.patch(
  "/admin-review",
  verifyToken,
  verifyRole(["Admin"]),
  adminReview
);

// PATCH /api/verification/superadmin-verify
router.patch(
  "/superadmin-verify",
  verifyToken,
  verifyRole(["SuperAdmin"]),
  superadminVerify
);

// PATCH /api/verification/master-approve
router.patch(
  "/master-approve",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  masterApprove
);

/**
 * *********************** Deletion Endpoints (Master Admin Only) *************************
 */

router.delete(
  "/biodata/:submissionId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  deleteBiodataSubmission
);

router.delete(
  "/guarantor/:submissionId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  deleteGuarantorSubmission
);

router.delete(
  "/commitment/:submissionId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  deleteCommitmentSubmission
);

/**
 * *********************** GET Endpoints *************************
 */

router.get(
  "/submissions/master",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  getAllSubmissionsForMasterAdmin
);

router.get(
  "/submissions/admin",
  verifyToken,
  verifyRole(["Admin"]),
  getSubmissionsForAdmin
);

router.get(
  "/submissions/superadmin",
  verifyToken,
  verifyRole(["SuperAdmin"]),
  getSubmissionsForSuperAdmin
);

/**
 * *********************** “Success” Endpoints (to avoid 404s) *************************
 */

router.patch("/biodata-success",    verifyToken, biodataSuccess);
router.patch("/guarantor-success",  verifyToken, guarantorSuccess);
router.patch("/commitment-success", verifyToken, commitmentSuccess);

module.exports = router;
