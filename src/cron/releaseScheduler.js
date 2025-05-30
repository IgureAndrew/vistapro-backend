// src/cron/releaseScheduler.js
const cron      = require('node-cron');
const walletSvc = require('../services/walletService');

(() => {
  // Grab today’s date/time
  const now = new Date();
  const sec = 0;              // at the top of the minute
  const min = 42;             // 42nd minute
  const hr  = 22;             // 22:00 hour

  // Build a 6-field cron pattern: second minute hour dayOfMonth month dayOfWeek
  const pattern = `${sec} ${min} ${hr} * * *`;

  // Schedule it
  const oneOffJob = cron.schedule(
    pattern,
    async () => {
      console.log('🕑 one-off release at 22:42:00 running…');
      try {
        await walletSvc.scheduleMonthlyReleases();
        console.log('✅ one-off release requests created.');
      } catch (err) {
        console.error('❌ error on one-off release:', err);
      } finally {
        oneOffJob.stop();   // unschedule after it runs once
      }
    },
    {
      timezone: 'Africa/Lagos',
      scheduled: true
    }
  );

  console.log(`🔜 one-off withhold‐release scheduled for today at 22:42:00 (pattern: "${pattern}")`);
})();
