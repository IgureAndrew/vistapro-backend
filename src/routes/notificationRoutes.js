// src/routes/notificationRoutes.js
const express = require("express");
const { listNotifications, markAsRead } = require("../controllers/notificationController");
const { verifyToken } = require("../middlewares/authMiddleware"); // your JWT guard

const router = express.Router();

// all endpoints below require a valid JWT
router.use(verifyToken);

// GET  /api/notifications          → listNotifications
router.get("/", listNotifications);

// PATCH /api/notifications/:id/read → markAsRead
router.patch("/:id/read", markAsRead);

module.exports = router;
