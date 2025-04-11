// src/routes/verificationRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");

// Use memory storage so that files are available as buffers.
const memoryStorage = multer.memoryStorage();
const upload = multer({ storage: memoryStorage });

// Import authentication and role verification middleware.
const { verifyToken } = require("../middlewares/authMiddleware");
const { verifyRole } = require("../middlewares/roleMiddleware");

// Import all controller functions from the VerificationController.
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
} = require("../controllers/verificationController");

/**
 * *********************** Submission Endpoints *************************
 */

// Biodata Submission Route:
// - Expects two file uploads via FormData:
//    - "passport_photo" (passport photo)
//    - "id_document" (means of identification file)
// Only authenticated Marketers can submit.
router.post(
  "/bio-data",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.fields([
    { name: "passport_photo", maxCount: 1 },
    { name: "id_document", maxCount: 1 }
  ]),
  submitBiodata
);

// Guarantor Submission Route:
// - Expects file uploads:
//    - "identification_file" (for the selected identification document image)
//    - "signature" (for the guarantor's signature image)
// Only authenticated Marketers can submit.
router.post(
  "/guarantor",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.fields([
    { name: "identification_file", maxCount: 1 },
    { name: "signature", maxCount: 1 }
  ]),
  submitGuarantor
);

// Commitment Handbook Submission Route:
// - Expects a single file upload under "signature" (Direct Sales Rep's signature)
// Only authenticated Marketers can submit.
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

// Update Biodata (for cases where the marketer needs to refill/update the biodata form)
router.put(
  "/bio-data",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.fields([
    { name: "passport_photo", maxCount: 1 },
    { name: "id_document", maxCount: 1 }
  ]),
  updateBiodata
);

/**
 * *********************** Admin / Master Admin Endpoints *************************
 */

// Allow Master Admin to reset a form (allow the marketer to refill a form if needed)
// The request body must contain { marketerUniqueId, formType }.
router.patch(
  "/allow-refill",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  allowRefillForm
);

// Admin review endpoint to review submitted forms.
// Expects necessary review details in the request body.
router.patch(
  "/admin-review",
  verifyToken,
  verifyRole(["Admin"]),
  adminReview
);

// SuperAdmin verification endpoint.
// Expects necessary verification details in the request body.
router.patch(
  "/superadmin-verify",
  verifyToken,
  verifyRole(["SuperAdmin"]),
  superadminVerify
);

// Master Admin final approval endpoint.
// Expects { marketerUniqueId } in the body.
router.patch(
  "/master-approve",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  masterApprove
);

/**
 * *********************** Deletion Endpoints (Master Admin Only) *************************
 */

// Delete a biodata submission by its submissionId.
router.delete(
  "/bio-data/:submissionId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  deleteBiodataSubmission
);

// Delete a guarantor submission by its submissionId.
router.delete(
  "/guarantor/:submissionId",
  verifyToken,
  verifyRole(["MasterAdmin"]),
  deleteGuarantorSubmission
);

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

// Get a single biodata submission by its submission ID.
router.get(
  "/bio-data/:id",
  verifyToken,
  getBiodataSubmissionById
);

module.exports = router;
