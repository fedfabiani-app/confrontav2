import cron from 'node-cron';
import { cleanupService } from './services/cleanup';
import { cleanupTracker } from './services/cleanupTracker';
import { getScraperConfig, isWithinTimeWindow, getItalyToday } from './config/scraperConfig';
import { prisma } from './services/database';

export async function initializeScheduledTasks() {
  // Ensure tracker table exists
  await cleanupTracker.ensureTrackerTable();

  // INTEGRATION TEST CRON: Validates database + config + cron work together
  // Runs every 2 minutes to test the foundation
  cron.schedule('*/2 * * * *', async () => {
    try {
      console.log('\n========== [INTEGRATION TEST] Starting ==========');
      
      // Step 1: Read config
      console.log('[INTEGRATION TEST] Step 1: Reading config...');
      const config = await getScraperConfig();
      console.log('[INTEGRATION TEST] Config loaded:');
      console.log(`  - Enabled: ${config.enabled}`);
      console.log(`  - Time Window: ${config.startTime} - ${config.endTime}`);
      console.log(`  - Interval: ${config.intervalMinutes} minutes`);
      console.log(`  - Timezone: ${config.timezone}`);
      console.log(`  - Max Retries: ${config.maxRetriesPerSource}`);
      console.log(`  - Auto Retry Delay: ${config.autoRetryDelayMinutes} minutes`);
      
      // Step 2: Check time window
      console.log('[INTEGRATION TEST] Step 2: Checking time window...');
      const withinWindow = isWithinTimeWindow(config);
      const now = new Date();
      const italyTime = now.toLocaleString('it-IT', {
        timeZone: 'Europe/Rome',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      console.log(`  - Current time (Italy): ${italyTime}`);
      console.log(`  - Within scraping window: ${withinWindow}`);
      
      // Step 3: Create test execution record
      console.log('[INTEGRATION TEST] Step 3: Creating test execution record...');
      const targetDateStr = getItalyToday();
      const targetDate = new Date(targetDateStr + 'T00:00:00.000Z');
      const execution = await prisma.scraperExecution.create({
        data: {
          status: 'completed',
          target_date: targetDate,
          trigger_type: 'manual',
          total_jobs_enqueued: 0,
          successful_jobs: 0,
          failed_jobs: 0,
          started_at: new Date(),
          completed_at: new Date()
        }
      });
      console.log(`  - Created execution record: ID ${execution.id}`);
      console.log(`  - Target date: ${targetDateStr}`);
      console.log(`  - Status: ${execution.status}`);
      
      console.log('[INTEGRATION TEST] ✓ All steps completed successfully!');
      console.log('========== [INTEGRATION TEST] Complete ==========\n');
    } catch (error) {
      console.error('[INTEGRATION TEST] ✗ Error:', error);
    }
  }, {
    timezone: 'Europe/Rome'
  });

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
  console.log('[Scheduler] Scheduled tasks initialized:');
  console.log('  - Cleanup: Daily at 3 AM (31-day interval)');
  console.log('  - Integration Test: Every 2 minutes (testing database + config + cron)');
  if (lastCleanup) {
    console.log(`[Scheduler] Last cleanup: ${lastCleanup.toISOString()}`);
  } else {
    console.log('[Scheduler] No previous cleanup found');
  }
}
