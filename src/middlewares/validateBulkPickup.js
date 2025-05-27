// src/middlewares/validateBulkPickup.js
module.exports = function validateBulkPickup(req, res, next) {
  const lines = req.body.items;
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ message: "Must supply items array." });
  }
  // flatten qty sum
  const total = lines.reduce((sum, { quantity }) => sum + (parseInt(quantity)||0), 0);
  if (total < 1) {
    return res.status(400).json({ message: "Total quantity must be ≥1." });
  }
  req.bulk = { lines, total };
  next();
};
