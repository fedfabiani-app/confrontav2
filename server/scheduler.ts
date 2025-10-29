import cron from 'node-cron';
import { cleanupService } from './services/cleanup';
import { cleanupTracker } from './services/cleanupTracker';

export async function initializeScheduledTasks() {
  // Ensure tracker table exists
  await cleanupTracker.ensureTrackerTable();

  // TEST CRON: Uncomment to verify timezone functionality
  // cron.schedule('* * * * *', async () => {
  //   const now = new Date();
  //   const utcTime = now.toISOString();
  //   const italyTime = now.toLocaleString('it-IT', {
  //     timeZone: 'Europe/Rome',
  //     dateStyle: 'short',
  //     timeStyle: 'medium'
  //   });
  //   console.log(`[TEST CRON] Fired at ${utcTime} - Italy time: ${italyTime}`);
  // }, {
  //   timezone: 'Europe/Rome'
  // });

  // Check daily at 3 AM if cleanup should run (every 31 days)
  cron.schedule('0 3 * * *', async () => {
    try {
      const shouldRun = await cleanupTracker.shouldRunCleanup();
      
      if (shouldRun) {
        console.log('[Scheduler] Starting scheduled 31-day cleanup...');
        await cleanupService.cleanupHoroscopeData();
        await cleanupTracker.setLastCleanupDate(new Date());
        console.log('[Scheduler] Scheduled cleanup completed successfully');
      }
    } catch (error) {
      console.error('[Scheduler] Error during scheduled cleanup:', error);
    }
  });

  const lastCleanup = await cleanupTracker.getLastCleanupDate();
  console.log('[Scheduler] Scheduled tasks initialized: cleanup runs every 31 days at 3 AM');
  if (lastCleanup) {
    console.log(`[Scheduler] Last cleanup: ${lastCleanup.toISOString()}`);
  } else {
    console.log('[Scheduler] No previous cleanup found');
  }
}
