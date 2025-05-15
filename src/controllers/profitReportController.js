const { getProfitReport } = require('../services/profitReportService');

async function profitReport(req, res, next) {
  try {
    const { from, to } = req.query;
    const report = await getProfitReport(from, to);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

module.exports = { profitReport };
