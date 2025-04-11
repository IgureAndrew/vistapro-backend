// src/config/multerMemory.js
const multer = require("multer");

const storage = multer.memoryStorage(); // Files will be stored in a buffer in memory.
const upload = multer({ storage }); 

module.exports = upload;
