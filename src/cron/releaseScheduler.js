// src/cron/withheldReleasesCron.js
const cron      = require('node-cron');
const walletSvc = require('../services/walletService');

// ── 1) One-off at the next minute/hour, then stop itself ─────────
const now = new Date();
const M   = now.getMinutes();
const H   = now.getHours();

const oneOffJob = cron.schedule(
  // “At minute M of hour H any day/month/day-of-week”
  `${M} ${H} * * *`,
  async () => {
    console.log('🕑 (one-off) scheduling withheld releases…');
    try {
      await walletSvc.scheduleMonthlyReleases();
      console.log('✅ one-off release requests created.');
    } catch (err) {
      console.error('❌ error on one-off release:', err);
    } finally {
      oneOffJob.stop();   // unschedule this job immediately
    }
  },
  {
    timezone: 'Africa/Lagos',  // run in your local timezone
    scheduled: true            // start right away
  }
);

// ── 2) Still keep your regular monthly job if you like ────────────
cron.schedule(
  '5 0 1 * *',                // 00:05 on the 1st of each month
  async () => {
    console.log('🕑 (monthly) scheduling withheld releases…');
    try {
      await walletSvc.scheduleMonthlyReleases();
      console.log('✅ monthly release requests created.');
    } catch (err) {
      console.error('❌ error on monthly release:', err);
    }
  },
  { timezone: 'Africa/Lagos' }
);

// In your main server startup (e.g. src/index.js), just require this file:
// require('./cron/withheldReleasesCron');
