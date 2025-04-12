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

// Import controller functions from VerificationController.
const {
  submitBiodata,
  submitGuarantor,
  submitCommitment,
  updateBiodata,
  allowRefillForm,
  adminReview,
  superadminVerify,
  masterApprove,
  deleteBiodataSubmission,
  deleteGuarantorSubmission,
  deleteCommitmentSubmission,
  getBiodataSubmissionById,
  getAllSubmissionsForMasterAdmin,
  getSubmissionsForAdmin,
  getSubmissionsForSuperAdmin,
} = require("../controllers/verificationController");

/**
 * *********************** Submission Endpoints *************************
 */

// POST /api/verification/bio-data
// Biodata Submission Route:
// - Expects two file uploads (FormData):
//    - "passport_photo": for the passport photo.
//    - "id_document": for the means of identification file.
// Only authenticated Marketers can submit this form.
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
// Guarantor Submission Route:
// - Expects two file uploads:
//    - "identification_file": image of the selected identification document.
//    - "signature": the guarantor's signature image.
// Only authenticated Marketers can submit this form.
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
// Commitment Handbook Submission Route:
// - Expects a single file upload (the Direct Sales Rep's signature) under the field "signature".
// Only authenticated Marketers can submit this form.
router.post(
  "/commitment-handbook",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.single("signature"),
  submitCommitment
);

/**
 * *********************** Update Endpoints *************************
 */

// PUT /api/verification/bio-data
// Update Biodata: Allows a marketer to update their existing biodata (including re-uploading files).
router.put(
  "/bio-data",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.fields([
    { name: "passport_photo", maxCount: 1 },
    { name: "id_document", maxCount: 1 },
  ]),
  updateBiodata
);

/**
 * *********************** Admin / Master Admin Endpoints *************************
 */

// PATCH /api/verification/allow-refill
// Allow Refill: Allows a Master Admin to reset a submission flag (biodata, guarantor, or commitment)
// so that a marketer can re-submit a form.
router.patch(
  "/allow-refill",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  allowRefillForm
);

// PATCH /api/verification/admin-review
// Admin Review: Allows an Admin to review the submitted forms and set review flags plus a report.
router.patch(
  "/admin-review",
  verifyToken,
  verifyRole(["Admin"]),
  adminReview
);

// PATCH /api/verification/superadmin-verify
// SuperAdmin Verification: Allows a SuperAdmin to verify or reject a marketer's submission,
// only if the marketer is assigned to an admin under the SuperAdmin.
router.patch(
  "/superadmin-verify",
  verifyToken,
  verifyRole(["SuperAdmin"]),
  superadminVerify
);

// PATCH /api/verification/master-approve
// Master Admin Final Approval: Allows the Master Admin to give final approval (activating the marketer's account)
// and unlock their dashboard.
router.patch(
  "/master-approve",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  masterApprove
);

/**
 * *********************** Deletion Endpoints (Master Admin Only) *************************
 */

// DELETE /api/verification/bio-data/:submissionId
// Delete a biodata submission by its submissionId.
router.delete(
  "/bio-data/:submissionId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  deleteBiodataSubmission
);

// DELETE /api/verification/guarantor/:submissionId
// Delete a guarantor submission by its submissionId.
router.delete(
  "/guarantor/:submissionId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  deleteGuarantorSubmission
);

// DELETE /api/verification/commitment/:submissionId
// Delete a commitment submission by its submissionId.
router.delete(
  "/commitment/:submissionId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  deleteCommitmentSubmission
);

/**
 * *********************** GET Endpoints *************************
 */

// GET /api/verification/bio-data/:id
// Retrieve a single biodata submission by its submission ID.
router.get(
  "/bio-data/:id",
  verifyToken,
  getBiodataSubmissionById
);

// GET /api/verification/submissions/master
// Returns all submissions (biodata, guarantor, commitment) for Master Admin review.
router.get(
  "/submissions/master",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  getAllSubmissionsForMasterAdmin
);

// GET /api/verification/submissions/admin
// Returns submissions (biodata, guarantor, commitment) for marketers assigned to the logged-in Admin.
router.get(
  "/submissions/admin",
  verifyToken,
  verifyRole(["Admin"]),
  getSubmissionsForAdmin
);

// GET /api/verification/submissions/superadmin
// Returns submissions (biodata, guarantor, commitment) for marketers whose assigned admin is under the logged-in SuperAdmin.
router.get(
  "/submissions/superadmin",
  verifyToken,
  verifyRole(["SuperAdmin"]),
  getSubmissionsForSuperAdmin
);

module.exports = router;
