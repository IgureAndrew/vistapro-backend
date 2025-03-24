// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

/**
 * verifyToken - Middleware to check for a valid JWT in the Authorization header.
 * If the token is valid, the decoded payload is attached to req.user.
 * Otherwise, a 401 Unauthorized response is sent.
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ message: 'No token provided.' });
  }
  
  // Expect the header format to be "Bearer <token>"
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Token format is invalid.' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Token is invalid.' });
    }
    
    req.user = decoded;
    next();
  });
};

module.exports = { verifyToken };
