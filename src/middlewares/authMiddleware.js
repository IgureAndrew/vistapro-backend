const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();
const { pool } = require('../config/database');

/**
 * verifyToken - Middleware to check for a valid JWT in the Authorization header.
 * If the token is valid, we fetch the full user details from the database
 * and attach them to req.user. Otherwise, a 401 Unauthorized response is sent.
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Token format is invalid.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token has expired.' });
      }
      return res.status(401).json({ message: 'Token is invalid.' });
    }

    try {
      // Fetch full user record so we have names & role
      const { rows } = await pool.query(
        'SELECT id, unique_id, first_name, last_name, role FROM users WHERE id = $1',
        [decoded.id]
      );
      if (!rows.length) {
        return res.status(401).json({ message: 'User not found.' });
      }
      req.user = rows[0];
      next();
    } catch (dbErr) {
      next(dbErr);
    }
  });
}

/**
 * verifyRole(allowedRoles) - Returns middleware that ensures
 * req.user.role is one of the allowedRoles array.
 * Otherwise responds with 403 Forbidden.
 */
function verifyRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role.' });
    }
    next();
  };
}

module.exports = {
  verifyToken,
  verifyRole,
};
