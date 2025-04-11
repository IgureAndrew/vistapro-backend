// src/utils/cloudinaryUpload.js
const cloudinary = require("../config/cloudinaryConfig");
const streamifier = require("streamifier");

/**
 * Uploads a file buffer to Cloudinary using the uploader.upload_stream method.
 * @param {Buffer} buffer - The file buffer.
 * @param {Object} options - Options for the upload (folder, allowed formats, etc).
 * @returns {Promise} - Resolves with Cloudinary’s result object.
 */
const uploadFromBuffer = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

module.exports = { uploadFromBuffer };
