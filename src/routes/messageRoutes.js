// src/routes/messageRoutes.js
const express = require('express')
const router  = express.Router()
const { verifyToken } = require('../middlewares/authMiddleware')
const ctrl    = require('../controllers/messageController')

router.use(verifyToken)
router.get('/contacts', ctrl.listContacts)
router.get('/threads/:with', ctrl.getThread)       // optional: load chat history
router.post('/threads/:with', ctrl.sendMessage)

module.exports = router
