// src/routes/verificationRoutes.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/authMiddleware");
const { verifyRole } = require("../middlewares/roleMiddleware");
const {
  submitBiodata,
  submitGuarantor,
  submitCommitment,
  adminReview,
  getSubmissions,
  superadminVerify,
  masterApprove,
  deleteBiodataSubmission,
  deleteGuarantorSubmission,
  deleteCommitmentSubmission,
} = require("../controllers/verificationController");

// Submission endpoints
router.post("/biodata", verifyToken, submitBiodata);
router.post("/guarantor", verifyToken, submitGuarantor);
router.post("/commitment", verifyToken, submitCommitment);
router.get("/submissions", verifyToken, getSubmissions);

// Review endpoints
router.patch("/admin-review", verifyToken, verifyRole(["Admin"]), adminReview);
router.patch("/superadmin-verify", verifyToken, verifyRole(["SuperAdmin"]), superadminVerify);
router.patch("/master-approve", verifyToken, verifyRole(["MasterAdmin"]), masterApprove);

// Deletion endpoints (Master Admin only)
router.delete("/biodata/:submissionId", verifyToken, verifyRole(["MasterAdmin"]), deleteBiodataSubmission);
router.delete("/guarantor/:submissionId", verifyToken, verifyRole(["MasterAdmin"]), deleteGuarantorSubmission);
router.delete("/commitment/:submissionId", verifyToken, verifyRole(["MasterAdmin"]), deleteCommitmentSubmission);

module.exports = router;
