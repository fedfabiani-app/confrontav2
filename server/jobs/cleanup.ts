
import cron from 'node-cron';
import { performDatabaseCleanup } from '../services/cleanup';

let cleanupJob: cron.ScheduledTask | null = null;

export function startCleanupScheduler() {
  // Schedule cleanup every 31 days at 2:00 AM
  // Cron expression: '0 2 */31 * *' - At 02:00 on every 31st day
  // Note: For testing, you can use '*/5 * * * *' for every 5 minutes
  
  const cronExpression = '0 2 */31 * *'; // Every 31 days at 2:00 AM
  
  if (cleanupJob) {
    console.log('[CleanupScheduler] Cleanup job already running, stopping previous instance');
    cleanupJob.stop();
  }

  cleanupJob = cron.schedule(cronExpression, async () => {
    console.log('[CleanupScheduler] Triggered scheduled database cleanup');
    
    try {
      const result = await performDatabaseCleanup();
      
      if (result.success) {
        console.log(`[CleanupScheduler] Cleanup completed successfully`);
        console.log(`[CleanupScheduler] Deleted ${result.horoscopeDataDeleted} horoscope records`);
        console.log(`[CleanupScheduler] Deleted ${result.weeklyHoroscopeDataDeleted} weekly records`);
      } else {
        console.error(`[CleanupScheduler] Cleanup failed: ${result.error}`);
      }
    } catch (error) {
      console.error('[CleanupScheduler] Unexpected error during cleanup:', error);
    }
  }, {
    scheduled: true,
    timezone: "Europe/Rome" // Italian timezone
  });

  console.log(`[CleanupScheduler] Database cleanup scheduled with cron: ${cronExpression}`);
  console.log('[CleanupScheduler] Next cleanup will run every 31 days at 2:00 AM (Europe/Rome)');
}

export function stopCleanupScheduler() {
  if (cleanupJob) {
    cleanupJob.stop();
    cleanupJob = null;
    console.log('[CleanupScheduler] Cleanup scheduler stopped');
  }
}

export function triggerManualCleanup(): Promise<any> {
  console.log('[CleanupScheduler] Manual cleanup triggered');
  return performDatabaseCleanup();
}
