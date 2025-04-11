// src/routes/verificationRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");

// Import your Cloudinary storage engine.
// Ensure the path is correct based on your folder structure.
const storage = require("../config/cloudinaryMulter");
const upload = multer({ storage });

// Import authentication and role verification middleware.
const { verifyToken } = require("../middlewares/authMiddleware");
const { verifyRole } = require("../middlewares/roleMiddleware");

// Import the controller function for submitting biodata.
const { submitBiodata,  submitGuarantor, submitCommitment } = require("../controllers/verificationController");

// Define the route for biodata submission.
// It expects file uploads under the field names "passport_photo" and "id_document".
router.post(
  "/bio-data",
  verifyToken,                    // Ensure the request is authenticated.
  verifyRole(["Marketer"]),       // Only users with the Marketer role can submit.
  upload.fields([
    { name: "passport_photo", maxCount: 1 },
    { name: "id_document", maxCount: 1 }
  ]),
  submitBiodata                   // The controller function handles the submission.
);


// Guarantor submission endpoint (updated):
// For the new guarantor form, the marketer chooses a means of identification from a dropdown
// (with options like "NIN", "International Passport", "Driver's License") and then uploads an image
// of the selected identification under the field "identification_file". In addition, the guarantor must
// upload their signature image under "signature".
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


  // New Commitment Handbook Route:
router.post(
    "/commitment-handbook",
    verifyToken,
    verifyRole(["Marketer"]),
    upload.single("signature"),
    submitCommitment
  );
module.exports = router;
