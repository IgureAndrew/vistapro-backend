const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { listNotifications, markAsRead } = require('../controllers/notificationController');

// list + unread count
router.get('/', verifyToken, listNotifications);
// mark one as read
router.patch('/:id/read', verifyToken, markAsRead);

module.exports = router;
