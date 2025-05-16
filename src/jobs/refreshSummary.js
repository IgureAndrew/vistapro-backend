// backend/src/jobs/refreshSummary.js
const cron = require('node-cron');
const { refreshSummary } = require('../services/profitReportService');

cron.schedule('0 2 * * *', async () => {
  try {
    await refreshSummary();
    console.log('daily_sales_summary refreshed at 2am');
  } catch (err) {
    console.error('refresh failed', err);
  }
});
