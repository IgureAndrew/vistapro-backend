const express = require("express");
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const {
  submitBiodata,
  submitGuarantor,
  submitCommitment,
  adminReview,
  getSubmissions,
  superadminVerify,
  masterApprove,
} = require("../controllers/verificationController");

// Secure the routes by adding verifyToken (and verifyRole if applicable)
router.post("/biodata", verifyToken, submitBiodata);
router.post("/guarantor", verifyToken, submitGuarantor);
router.post("/commitment", verifyToken, submitCommitment);
router.get("/submissions", verifyToken, getSubmissions);
router.patch("/admin-review", verifyToken, verifyRole(["Admin"]), adminReview);
router.patch("/superadmin-verify", verifyToken, verifyRole(["SuperAdmin"]), superadminVerify);
router.patch("/master-approve", verifyToken, verifyRole(["MasterAdmin"]), masterApprove);

module.exports = router;
