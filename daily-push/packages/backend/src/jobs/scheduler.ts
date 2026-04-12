import cron from 'node-cron';
import { runDailyDigest } from './dailyDigest.job';

export function initScheduler(): void {
  // Run every day at 08:00 (Asia/Kolkata = UTC+5:30, so 02:30 UTC)
  // Adjust the cron expression here to match your local time
  cron.schedule('30 2 * * *', async () => {
    try {
      await runDailyDigest();
    } catch (err) {
      console.error('[scheduler] Daily digest failed:', err);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  console.log('✓ Scheduler initialized (daily digest at 08:00 IST)');
}
