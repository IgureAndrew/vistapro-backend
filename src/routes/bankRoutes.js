// routes/bankRoutes.js
const express = require("express");
const router = express.Router();
const { getBanks } = require("../controllers/bankController");

router.get("/", getBanks);

module.exports = router;
