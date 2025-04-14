// src/middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();
const { pool } = require("../config/database");

// Helper function: Get full user details from the database using the user ID from the token.
const getUserFromDB = async (userId) => {
  const query = "SELECT * FROM users WHERE id = $1";
  const { rows } = await pool.query(query, [userId]);
  return rows[0];
};

/**
 * verifyToken - Middleware to check for a valid JWT in the Authorization header.
 * If the token is valid, it fetches full user details from the database
 * (including location, role, and unique_id) and attaches them to req.user.
 * Otherwise, a 401 Unauthorized response is sent.
 */
const verifyToken = (req, res, next) => {
  // Support for lowercase or uppercase header key.
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (!authHeader) {
    return res.status(401).json({ message: "No token provided." });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token format is invalid." });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "TokenExpired" });
      }
      return res.status(401).json({ message: "Token is invalid." });
    }

    // Use decoded.userId from the token payload to retrieve full user details.
    const user = await getUserFromDB(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Attach required user fields to req.user.
    req.user = {
      id: user.id,
      unique_id: user.unique_id,
      role: user.role,
      location: user.location,
      // Add any additional fields needed by your application.
    };

    next();
  });
};

module.exports = { verifyToken };
