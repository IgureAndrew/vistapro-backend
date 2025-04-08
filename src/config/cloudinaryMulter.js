const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinaryConfig");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "Vistaprouploads", // specify folder in Cloudinary
    allowed_formats: ["jpg", "jpeg", "png"], // allowed file formats
  },
});

const upload = multer({ storage: storage });
module.exports = upload;
