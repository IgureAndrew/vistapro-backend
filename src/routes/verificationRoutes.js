// src/routes/verificationRoutes.js
const express = require("express");
const router = express.Router();
const {
  submitBiodata,
  submitGuarantor,
  submitCommitment,
  adminReview,
  superadminVerify,
  masterApprove,
} = require("../controllers/verificationController");
const { verifyToken } = require("../middlewares/authMiddleware");
const { verifyRole } = require("../middlewares/roleMiddleware");

// Marketer submits forms
router.post("/biodata", verifyToken, submitBiodata);
router.post("/guarantor", verifyToken, submitGuarantor);
router.post("/commitment", verifyToken, submitCommitment);

// Admin review endpoint (only Admins can review)
router.patch("/admin-review", verifyToken, verifyRole(["Admin"]), adminReview);

// SuperAdmin verification endpoint (only SuperAdmins can verify)
router.patch("/superadmin-verify", verifyToken, verifyRole(["SuperAdmin"]), superadminVerify);

// Master Admin final approval (only MasterAdmin)
router.patch("/master-approve", verifyToken, verifyRole(["MasterAdmin"]), masterApprove);

module.exports = router;
