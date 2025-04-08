// cloudinaryConfig.js
const cloudinary = require("cloudinary").v2;
const dotenv = require("dotenv");
dotenv.config(); // Loads environment variables from .env

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,   // e.g., "mycloudname"
  api_key: process.env.CLOUDINARY_API_KEY,         // e.g., "123456789012345"
  api_secret: process.env.CLOUDINARY_API_SECRET      // e.g., "abcdefghijk1234567890"
});

module.exports = cloudinary;
