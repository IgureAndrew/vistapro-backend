// src/utils/uploadToCloudinary.js
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

// Configure Cloudinary using your config (or import your cloudinaryConfig if already set up)
require("dotenv").config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,   // e.g., "mycloudname"
  api_key: process.env.CLOUDINARY_API_KEY,           // e.g., "123456789012345"
  api_secret: process.env.CLOUDINARY_API_SECRET      // e.g., "abcdefghijk1234567890"
});

// Returns a promise that resolves to the upload result.
const uploadToCloudinary = (buffer, options) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

module.exports = uploadToCloudinary;
