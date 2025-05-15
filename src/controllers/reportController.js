const reportService = require('../services/reportService');

async function getStats(req, res, next) {
  try {
    const { from, to } = req.query;
    const stats = await reportService.getStats(from, to);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats };
