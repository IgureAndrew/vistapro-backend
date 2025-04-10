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
  getBiodataSubmissionById,  // New endpoint to fetch a specific biodata submission
  superadminVerify,
  masterApprove,
  deleteBiodataSubmission,
  deleteGuarantorSubmission,
  deleteCommitmentSubmission,
} = require("../controllers/verificationController");

// Submission endpoints

// Updated biodata route to accept two file fields: "passport_photo" and "id_document"
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

router.post("/guarantor", verifyToken, submitGuarantor);
router.post("/commitment", verifyToken, submitCommitment);
router.get("/submissions", verifyToken, getSubmissions);

// New endpoint to retrieve a single biodata submission by submission ID.
router.get("/bio-data/:id", verifyToken, getBiodataSubmissionById);

// Review endpoints
router.patch("/admin-review", verifyToken, verifyRole(["Admin"]), adminReview);
router.patch("/superadmin-verify", verifyToken, verifyRole(["SuperAdmin"]), superadminVerify);
router.patch("/master-approve", verifyToken, verifyRole(["MasterAdmin"]), masterApprove);

// Deletion endpoints (Master Admin only)
router.delete("/biodata/:submissionId", verifyToken, verifyRole(["MasterAdmin"]), deleteBiodataSubmission);
router.delete("/guarantor/:submissionId", verifyToken, verifyRole(["MasterAdmin"]), deleteGuarantorSubmission);
router.delete("/commitment/:submissionId", verifyToken, verifyRole(["MasterAdmin"]), deleteCommitmentSubmission);

module.exports = router;
