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

router.post("/biodata", submitBiodata);
router.post("/guarantor", submitGuarantor);
router.post("/commitment", submitCommitment);
router.patch("/admin-review", adminReview);
router.patch("/superadmin-verify", superadminVerify);
router.patch("/master-approve", masterApprove);

module.exports = router;
