// routes/verificationRoutes.js
const express = require("express");
const router = express.Router();
const {
  submitVerification,
  getPendingVerifications,
  approveVerification
} = require("../controllers/verificationController");

// Route for marketers to submit their verification forms.
router.post("/submit", submitVerification);

// Route for the Master Admin to fetch pending verifications.
router.get("/pending", getPendingVerifications);

// Route for the Master Admin to approve a specific marketer's verification.
// The marketer_id is passed as a route parameter.
router.patch("/approve/:marketer_id", approveVerification);

module.exports = router;
