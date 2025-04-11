// test-upload.js
const express = require("express");
const multer = require("multer");
const storage = require("./src/config/cloudinaryMulter"); // adjust the path as needed
const app = express();

// Initialize multer with your Cloudinary storage engine.
const upload = multer({ storage });

// A simple POST route to test file uploads.
// Use the field name "image" when uploading.
app.post("/upload", upload.single("image"), (req, res) => {
  // If upload is successful, req.file should contain details about the file on Cloudinary.
  if (req.file) {
    res.status(200).json({
      message: "File uploaded successfully!",
      file: req.file,
    });
  } else {
    res.status(400).json({ message: "No file uploaded." });
  }
});

// Error handling middleware.
app.use((err, req, res, next) => {
  console.error("Upload error:", err);
  res.status(500).json({ message: "An error occurred during file upload.", error: err.message });
});

// Start the server on port 3000.
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Test server listening on port ${PORT}`);
});
