// src/jobs/releaseWithheld.js
const cron = require('node-cron');
const walletService = require('../services/walletService');

// Schedule: 0:00 on the 1st of every month
cron.schedule('0 0 1 * *', async () => {
  try {
    await walletService.releaseWithheld();
    console.log('[Cron] Withheld balances released');
  } catch (err) {
    console.error('[Cron] Release error:', err);
  }
});


// Every day at midnight UTC check if it’s the 1st of the month
setInterval(async () => {
  const now = new Date();
  if (now.getUTCDate() === 1 && now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
    try {
      await walletService.releaseWithheld();
      console.log('[Scheduler] Withheld balances released');
    } catch (err) {
      console.error('[Scheduler] Release error:', err);
    }
  }
}, 60 * 1000); // check every minute

