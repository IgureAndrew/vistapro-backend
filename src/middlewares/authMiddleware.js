// src/middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();
const { pool } = require("../config/database");

// Helper function: Retrieve user details from the database using the user ID from the token.
const getUserFromDB = async (userId) => {
  const query = "SELECT * FROM users WHERE id = $1";
  const { rows } = await pool.query(query, [userId]);
  return rows[0];
};

/**
 * verifyToken - Middleware to check for a valid JWT in the Authorization header.
 * If the token is valid, the middleware fetches user details from the DB and attaches necessary fields to req.user.
 * Otherwise, it responds with a 401 Unauthorized error.
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
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

    // Assume the token payload includes a property 'userId'
    const user = await getUserFromDB(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Attach necessary user fields to req.user.
    req.user = {
      id: user.id,
      unique_id: user.unique_id,
      location: user.location,
      role: user.role,
      // add any other properties you need from the user object
    };

    next();
  });
};

module.exports = { verifyToken };
