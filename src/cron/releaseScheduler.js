const cron = require('node-cron');
const walletSvc = require('../services/walletService');

// run at 00:05 on the 1st of every month
cron.schedule('5 0 1 * *', async () => {
  console.log('🕑 scheduling monthly withheld releases…');
  try {
    await walletSvc.scheduleMonthlyReleases();
    console.log('✅ scheduled release requests created.');
  } catch (err) {
    console.error('❌ error creating release requests:', err);
  }
});
