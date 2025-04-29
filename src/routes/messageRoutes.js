const express = require('express');
const { verifyToken } = require('../middlewares/authMiddleware');
const { canMessage }  = require('../utils/messageAuth');
const { pool }        = require('../config/database');
const router = express.Router();

// send a new message
router.post(
  '/',
  verifyToken,
  async (req, res, next) => {
    try {
      const from = req.user.unique_id;
      const { to, content } = req.body;
      if (!to || !content) {
        return res.status(400).json({ message: "Both `to` and `content` are required" });
      }

      if (!await canMessage(from, to)) {
        return res.status(403).json({ message: "Not allowed to message that user" });
      }

      const { rows: [msg] } = await pool.query(
        `INSERT INTO messages (sender_unique_id, receiver_unique_id, content)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [from, to, content]
      );

      res.status(201).json(msg);
    } catch (err) {
      next(err);
    }
  }
);

// fetch chat history between current user and `:withUid`
router.get(
  '/thread/:withUid',
  verifyToken,
  async (req, res, next) => {
    try {
      const me     = req.user.unique_id;
      const them   = req.params.withUid;

      if (!await canMessage(me, them)) {
        return res.status(403).json({ message: "Cannot view conversation with that user" });
      }

      const { rows } = await pool.query(
        `SELECT * FROM messages
         WHERE (sender_unique_id = $1 AND receiver_unique_id = $2)
            OR (sender_unique_id = $2 AND receiver_unique_id = $1)
         ORDER BY created_at`,
        [me, them]
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
