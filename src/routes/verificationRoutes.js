// src/routes/verificationRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");

// Import your Cloudinary storage engine (adjust the path if necessary)
const storage = require("../config/cloudinaryMulter");
const upload = multer({ storage });

const { verifyToken } = require("../middlewares/authMiddleware");
const { verifyRole } = require("../middlewares/roleMiddleware");
const {
  submitBiodata,
  submitGuarantor,
  submitCommitment,
  adminReview,
  getSubmissions,
  getBiodataSubmissionById,  // New endpoint: fetch a specific biodata submission by submission ID
  superadminVerify,
  masterApprove,
  deleteBiodataSubmission,
  deleteGuarantorSubmission,
  deleteCommitmentSubmission,
} = require("../controllers/verificationController");

// -----------------------------------------------------------------
// Submission Endpoints
// -----------------------------------------------------------------

// Biodata Submission Route:
// Accepts multipart/form-data with two file fields: "passport_photo" and "id_document".
// The Cloudinary storage engine uploads the files to your designated Cloudinary folder.
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

// Guarantor Form Submission Route.
router.post("/guarantor", verifyToken, submitGuarantor);

// Commitment Form Submission Route.
router.post("/commitment", verifyToken, submitCommitment);

// Endpoint to fetch all submissions (for reviewing all forms).
router.get("/submissions", verifyToken, getSubmissions);

// New GET Endpoint: Retrieve a single biodata submission by its submission ID.
router.get("/bio-data/:id", verifyToken, getBiodataSubmissionById);

// -----------------------------------------------------------------
// Review Endpoints
// -----------------------------------------------------------------

// Admin Review of submitted forms.
router.patch("/admin-review", verifyToken, verifyRole(["Admin"]), adminReview);

// SuperAdmin verifies or rejects a marketer's forms.
router.patch("/superadmin-verify", verifyToken, verifyRole(["SuperAdmin"]), superadminVerify);

// Master Admin final approval (which also unlocks the marketer dashboard, etc).
router.patch("/master-approve", verifyToken, verifyRole(["MasterAdmin"]), masterApprove);

// -----------------------------------------------------------------
// Deletion Endpoints (Master Admin Only)
// -----------------------------------------------------------------

router.delete("/biodata/:submissionId", verifyToken, verifyRole(["MasterAdmin"]), deleteBiodataSubmission);
router.delete("/guarantor/:submissionId", verifyToken, verifyRole(["MasterAdmin"]), deleteGuarantorSubmission);
router.delete("/commitment/:submissionId", verifyToken, verifyRole(["MasterAdmin"]), deleteCommitmentSubmission);

module.exports = router;
