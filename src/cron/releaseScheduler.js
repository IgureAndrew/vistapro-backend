// src/cron/releaseScheduler.js
const cron      = require('node-cron');
const walletSvc = require('../services/walletService');

(() => {
  // 1) pick the target time: today at 22:42:00 (you could also use new Date())
  const SEC = 0;
  const MIN = 42;
  const HOUR = 22;

  // 6-field cron: sec min hour dom month dow
  const pattern = `${SEC} ${MIN} ${HOUR} * * *`;

  const job = cron.schedule(
    pattern,
    async () => {
      console.log('🕑 [one-off] running withheld-release scheduler…');
      try {
        await walletSvc.scheduleMonthlyReleases();
        console.log('✅ [one-off] release requests created.');
      } catch (err) {
        console.error('❌ [one-off] error:', err);
      } finally {
        job.stop();    // unschedule so it only runs once
      }
    },
    {
      scheduled: true,
      timezone: 'Africa/Lagos'
    }
  );

  console.log(`🔜 one-off withheld-release scheduled for today at ${HOUR}:${MIN}:${SEC} (pattern="${pattern}")`);
})();
