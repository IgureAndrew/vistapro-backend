// src/middlewares/roleMiddleware.js
/**
 * verifyRole - Middleware to allow access only if the authenticated user’s role is included in allowedRoles.
 * @param {Array} allowedRoles - Array of allowed role strings.
 */
const verifyRole = (allowedRoles) => {
  return (req, res, next) => {
    if (req.user && allowedRoles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ message: 'Insufficient permissions to access this resource.' });
  };
};

/**
 * verifyNotMasterAdmin - Prevent Master Admin from accessing certain modules.
 */
const verifyNotMasterAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'MasterAdmin') {
    return res.status(403).json({ message: 'This module is not available for Master Admin.' });
  }
  next();
};

module.exports = { verifyRole, verifyNotMasterAdmin };
