import cron from 'node-cron';
import { cleanupService } from './services/cleanup';

export function initializeScheduledTasks() {
  // Run cleanup every 31 days at 3 AM
  // Cron expression: "0 3 */31 * *" means "at 3:00 AM every 31 days"
  cron.schedule('0 3 */31 * *', async () => {
    console.log('[Scheduler] Starting scheduled 31-day cleanup...');
    try {
      await cleanupService.cleanupHoroscopeData();
      console.log('[Scheduler] Scheduled cleanup completed successfully');
    } catch (error) {
      console.error('[Scheduler] Error during scheduled cleanup:', error);
    }
  });

  console.log('[Scheduler] Scheduled tasks initialized: cleanup runs every 31 days at 3 AM');
}
