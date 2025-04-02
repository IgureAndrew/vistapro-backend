// src/routes/verificationRoutes.js
const express = require("express");
const router = express.Router();
const {
  submitBiodata,
  submitGuarantor,
  submitCommitment,
  adminReview,
  getSubmissions,
  superadminVerify,
  masterApprove,
} = require("../controllers/verificationController");

router.post("/biodata", submitBiodata);
router.post("/guarantor", submitGuarantor);
router.post("/commitment", submitCommitment);
router.get("/submissions", getSubmissions);
router.patch("/admin-review", adminReview);
router.patch("/superadmin-verify", superadminVerify);
router.patch("/master-approve", masterApprove);

module.exports = router;
