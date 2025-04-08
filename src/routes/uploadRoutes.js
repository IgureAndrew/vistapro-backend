// src/routes/uploadRoutes.js
const express = require("express");
const router = express.Router();
const upload = require("../config/cloudinaryMulter");

// Endpoint to handle single file upload with field name "image"
router.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  res.status(201).json({
    message: "File uploaded successfully",
    url: req.file.path, // Cloudinary returns the file URL in req.file.path
  });
});

module.exports = router;
