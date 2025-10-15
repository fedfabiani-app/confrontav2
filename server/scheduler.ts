import cron from 'node-cron';
import { cleanupService } from './services/cleanup';
import { cleanupTracker } from './services/cleanupTracker';

export async function initializeScheduledTasks() {
  // Ensure tracker table exists
  await cleanupTracker.ensureTrackerTable();

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
