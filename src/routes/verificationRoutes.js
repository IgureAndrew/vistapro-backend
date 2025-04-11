// src/routes/verificationRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");

// Use memory storage for Multer so that files are available as buffers.
const memoryStorage = multer.memoryStorage();
const upload = multer({ storage: memoryStorage });

// Import authentication and role verification middleware.
const { verifyToken } = require("../middlewares/authMiddleware");
const { verifyRole } = require("../middlewares/roleMiddleware");

// Import the controller functions for submitting forms.
const { submitBiodata, submitGuarantor, submitCommitment } = require("../controllers/verificationController");

// -------------------------------------
// Biodata Submission Route
// -------------------------------------
// This route expects two file uploads:
//   - "passport_photo" (for the passport photo)
//   - "id_document" (for the means of identification file)
// Only authenticated users with the Marketer role can submit.
router.post(
  "/bio-data",
  verifyToken,                    // Ensure the request is authenticated.
  verifyRole(["Marketer"]),       // Only users with the Marketer role can submit.
  upload.fields([
    { name: "passport_photo", maxCount: 1 },
    { name: "id_document", maxCount: 1 }
  ]),
  submitBiodata                   // Controller function handles the submission.
);

// -------------------------------------
// Guarantor Submission Route
// -------------------------------------
// For the new guarantor form, the marketer selects a means of identification
// (e.g., "NIN", "International Passport", or "Driver's License"). The guarantor then uploads:
//   - an image of the selected identification (field: "identification_file")
//   - their signature image (field: "signature")
// All other required text fields should also be provided.
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

// -------------------------------------
// Commitment Handbook Submission Route
// -------------------------------------
// This route handles the Commitment Handbook form submission.
// It expects a file upload under the field "signature" for the Direct Sales Rep's signature.
// Only authenticated users with the Marketer role can submit.
router.post(
  "/commitment-handbook",
  verifyToken,
  verifyRole(["Marketer"]),
  upload.single("signature"),
  submitCommitment
);

module.exports = router;
